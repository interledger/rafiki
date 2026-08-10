import crypto from 'node:crypto'
import { IocContract } from '@adonisjs/fold'
import { faker } from '@faker-js/faker'
import { GraphQLError } from 'graphql'
import { Redis } from 'ioredis'
import { Logger } from 'pino'
import { v4 as uuid } from 'uuid'

import { initIocContainer } from '..'
import { AppServices, TenantedAppContext } from '../app'
import { Config } from '../config/app'
import { GraphQLErrorCode } from '../graphql/errors'
import { generateApiSignature } from '../tests/apiSignature'
import { TestContainer, createTestApp } from '../tests/app'
import { createContext } from '../tests/context'
import { truncateTables } from '../tests/tableManager'
import { Tenant } from './model'
import { TenantService } from './service'
import {
  authenticatedTenantMiddleware,
  createTenantedApolloContext,
  unauthenticatedTenantMiddleware
} from './middleware'

describe('Tenant signature middleware', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let tenantService: TenantService
  let logger: Logger
  let redis: Redis
  let tenant: Tenant
  let operator: Tenant

  const operatorApiSecret = crypto.randomBytes(8).toString('base64')
  const requestBody = { test: 'value' }

  const createTenantedContext = (
    headers: Record<string, string>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: any = requestBody
  ): TenantedAppContext => {
    const ctx = createContext<TenantedAppContext>(
      {
        headers: { Accept: 'application/json', ...headers },
        url: '/graphql'
      },
      {},
      appContainer.container
    )
    // createKoaServer sets this on every request ctx
    ctx.logger = logger
    ctx.request.body = body
    return ctx
  }

  const createTenant = async (apiSecret: string): Promise<Tenant> =>
    Tenant.query(appContainer.knex).insertAndFetch({
      email: faker.internet.email(),
      publicName: faker.company.name(),
      apiSecret,
      idpConsentUrl: faker.internet.url(),
      idpSecret: 'test-idp-secret'
    })

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({
      ...Config,
      adminApiSecret: operatorApiSecret
    })
    appContainer = await createTestApp(deps)
    tenantService = await deps.use('tenantService')
    logger = await deps.use('logger')
    redis = await deps.use('redis')
  })

  beforeEach(async (): Promise<void> => {
    tenant = await createTenant(crypto.randomBytes(8).toString('base64'))
    operator = await createTenant(operatorApiSecret)
  })

  afterEach(async (): Promise<void> => {
    await redis.flushall()
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('authenticatedTenantMiddleware', (): void => {
    test.each`
      isOperator | description
      ${false}   | ${'tenanted non-operator'}
      ${true}    | ${'tenanted operator'}
    `(
      'stores the tenant on the request context for a $description request',
      async ({ isOperator }): Promise<void> => {
        const expectedTenant = isOperator ? operator : tenant
        const ctx = createTenantedContext({
          signature: generateApiSignature(
            expectedTenant.apiSecret,
            Config.adminApiSignatureVersion,
            requestBody
          ),
          'tenant-id': expectedTenant.id
        })

        const next = jest.fn()

        await expect(
          authenticatedTenantMiddleware(ctx, next)
        ).resolves.toBeUndefined()

        expect(ctx.tenantApiSignatureResult).toEqual({
          tenant: expectedTenant,
          isOperator
        })
        expect(next).toHaveBeenCalled()
      }
    )

    test("throws 401 when the signature isn't signed with the tenant secret", async (): Promise<void> => {
      const ctx = createTenantedContext({
        signature: generateApiSignature(
          'wrongsecret',
          Config.adminApiSignatureVersion,
          requestBody
        ),
        'tenant-id': tenant.id
      })

      const next = jest.fn()
      const ctxThrowSpy = jest.spyOn(ctx, 'throw')

      await expect(authenticatedTenantMiddleware(ctx, next)).rejects.toThrow()
      expect(ctxThrowSpy).toHaveBeenCalledWith(401, 'Unauthorized')
      expect(ctx.tenantApiSignatureResult).toBeUndefined()
      expect(next).not.toHaveBeenCalled()
    })

    test('throws 401 when the tenant id is not included', async (): Promise<void> => {
      const ctx = createTenantedContext({
        signature: generateApiSignature(
          tenant.apiSecret,
          Config.adminApiSignatureVersion,
          requestBody
        )
      })

      const next = jest.fn()
      const ctxThrowSpy = jest.spyOn(ctx, 'throw')

      await expect(authenticatedTenantMiddleware(ctx, next)).rejects.toThrow()
      expect(ctxThrowSpy).toHaveBeenCalledWith(401, 'Unauthorized')
      expect(next).not.toHaveBeenCalled()
    })

    test('throws 401 when the signature is not included', async (): Promise<void> => {
      const ctx = createTenantedContext({ 'tenant-id': tenant.id })

      const next = jest.fn()
      const ctxThrowSpy = jest.spyOn(ctx, 'throw')

      await expect(authenticatedTenantMiddleware(ctx, next)).rejects.toThrow()
      expect(ctxThrowSpy).toHaveBeenCalledWith(401, 'Unauthorized')
      expect(next).not.toHaveBeenCalled()
    })

    test('throws 401 when the tenant does not exist', async (): Promise<void> => {
      const ctx = createTenantedContext({
        signature: generateApiSignature(
          tenant.apiSecret,
          Config.adminApiSignatureVersion,
          requestBody
        ),
        'tenant-id': uuid()
      })

      const next = jest.fn()
      const ctxThrowSpy = jest.spyOn(ctx, 'throw')

      await expect(authenticatedTenantMiddleware(ctx, next)).rejects.toThrow()
      expect(ctxThrowSpy).toHaveBeenCalledWith(401, 'Unauthorized')
      expect(next).not.toHaveBeenCalled()
    })

    test('throws 401 when the signature is replayed', async (): Promise<void> => {
      const headers = {
        signature: generateApiSignature(
          tenant.apiSecret,
          Config.adminApiSignatureVersion,
          requestBody
        ),
        'tenant-id': tenant.id
      }

      await expect(
        authenticatedTenantMiddleware(createTenantedContext(headers), jest.fn())
      ).resolves.toBeUndefined()

      const replayedCtx = createTenantedContext(headers)
      const next = jest.fn()
      const ctxThrowSpy = jest.spyOn(replayedCtx, 'throw')

      await expect(
        authenticatedTenantMiddleware(replayedCtx, next)
      ).rejects.toThrow()
      expect(ctxThrowSpy).toHaveBeenCalledWith(401, 'Unauthorized')
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('unauthenticatedTenantMiddleware', (): void => {
    test.each`
      isOperator | description
      ${false}   | ${'tenanted non-operator'}
      ${true}    | ${'tenanted operator'}
    `(
      'stores the tenant on the request context for a $description request',
      async ({ isOperator }): Promise<void> => {
        const expectedTenant = isOperator ? operator : tenant
        const ctx = createTenantedContext({
          'tenant-id': expectedTenant.id
        })

        const next = jest.fn()

        await expect(
          unauthenticatedTenantMiddleware(ctx, next)
        ).resolves.toBeUndefined()

        expect(ctx.tenantApiSignatureResult).toEqual({
          tenant: expectedTenant,
          isOperator
        })
        expect(next).toHaveBeenCalled()
      }
    )

    test('leaves the request untenanted when no tenant id is provided', async (): Promise<void> => {
      const ctx = createTenantedContext({})

      const next = jest.fn()
      const tenantGetSpy = jest.spyOn(tenantService, 'get')

      await expect(
        unauthenticatedTenantMiddleware(ctx, next)
      ).resolves.toBeUndefined()

      expect(ctx.tenantApiSignatureResult).toBeUndefined()
      expect(tenantGetSpy).not.toHaveBeenCalled()
      expect(next).toHaveBeenCalled()
    })

    test('throws 401 when the tenant does not exist', async (): Promise<void> => {
      const ctx = createTenantedContext({ 'tenant-id': uuid() })

      const next = jest.fn()
      const ctxThrowSpy = jest.spyOn(ctx, 'throw')

      await expect(unauthenticatedTenantMiddleware(ctx, next)).rejects.toThrow()
      expect(ctxThrowSpy).toHaveBeenCalledWith(401, 'Unauthorized')
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('createTenantedApolloContext', (): void => {
    test.each`
      isOperator | description
      ${false}   | ${'tenanted non-operator'}
      ${true}    | ${'tenanted operator'}
    `(
      'builds the Apollo context from a $description request',
      async ({ isOperator }): Promise<void> => {
        const expectedTenant = isOperator ? operator : tenant
        const ctx = createTenantedContext({
          'tenant-id': expectedTenant.id
        })

        await unauthenticatedTenantMiddleware(ctx, jest.fn())

        expect(createTenantedApolloContext(ctx)).toEqual({
          tenant: expectedTenant,
          isOperator,
          container: appContainer.container,
          logger
        })
      }
    )

    test('throws an unauthenticated error when the request is untenanted', async (): Promise<void> => {
      const ctx = createTenantedContext({})

      await unauthenticatedTenantMiddleware(ctx, jest.fn())
      expect(ctx.tenantApiSignatureResult).toBeUndefined()

      let error: unknown
      try {
        createTenantedApolloContext(ctx)
      } catch (err) {
        error = err
      }

      expect(error).toBeInstanceOf(GraphQLError)
      expect(error).toMatchObject({
        message: 'Unauthorized',
        extensions: {
          code: GraphQLErrorCode.Unauthenticated
        }
      })
    })
  })

  describe('per-request tenant isolation', (): void => {
    // Regression: the tenant was once held in one variable shared by every request
    test('keeps concurrent requests tenanted to their own tenant', async (): Promise<void> => {
      const otherTenant = await createTenant(
        crypto.randomBytes(8).toString('base64')
      )

      const contexts = [tenant, otherTenant, operator].map((requestTenant) =>
        createTenantedContext({
          signature: generateApiSignature(
            requestTenant.apiSecret,
            Config.adminApiSignatureVersion,
            requestBody
          ),
          'tenant-id': requestTenant.id
        })
      )

      await Promise.all(
        contexts.map((ctx) => authenticatedTenantMiddleware(ctx, jest.fn()))
      )

      const apolloContexts = contexts.map((ctx) =>
        createTenantedApolloContext(ctx)
      )

      expect(
        apolloContexts.map((apolloCtx) => ({
          tenantId: apolloCtx.tenant.id,
          isOperator: apolloCtx.isOperator
        }))
      ).toEqual([
        { tenantId: tenant.id, isOperator: false },
        { tenantId: otherTenant.id, isOperator: false },
        { tenantId: operator.id, isOperator: true }
      ])
    })
  })
})
