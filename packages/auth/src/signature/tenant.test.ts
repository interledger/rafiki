import { IocContract } from '@adonisjs/fold'
import { faker } from '@faker-js/faker'
import Redis from 'ioredis'
import { initIocContainer } from '..'
import { AppServices, AppContext, TenantedAppContext } from '../app'
import { Config, IAppConfig } from '../config/app'
import { Tenant } from '../tenant/model'
import { generateApiSignature } from '../tests/apiSignature'
import { TestContainer, createTestApp } from '../tests/app'
import { createContext } from '../tests/context'
import { truncateTables } from '../tests/tableManager'
import {
  authenticatedTenantMiddleware,
  unauthenticatedTenantMiddleware
} from './tenant'
import { TenantService } from '../tenant/service'

describe('Tenant Middlewares', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let tenantService: TenantService
  let config: IAppConfig
  let tenant: Tenant
  let operator: Tenant
  let redis: Redis

  const operatorApiSecret = crypto.randomUUID()

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({
      ...Config,
      adminApiSecret: operatorApiSecret
    })
    config = await deps.use('config')
    appContainer = await createTestApp(deps)
    redis = await deps.use('redis')
    tenantService = await deps.use('tenantService')
  })

  beforeEach(async (): Promise<void> => {
    tenant = await Tenant.query().insertAndFetch({
      apiSecret: crypto.randomUUID(),
      idpConsentUrl: faker.internet.url(),
      idpSecret: 'test-idp-secret'
    })

    operator = await Tenant.query().insertAndFetch({
      apiSecret: operatorApiSecret,
      idpConsentUrl: faker.internet.url(),
      idpSecret: 'test-idp-secret'
    })
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
      'returns if $description request has valid signature',
      async ({ isOperator }): Promise<void> => {
        const requestBody = { test: 'value' }

        const signature = isOperator
          ? generateApiSignature(
              operator.apiSecret,
              Config.adminApiSignatureVersion,
              requestBody
            )
          : generateApiSignature(
              tenant.apiSecret,
              Config.adminApiSignatureVersion,
              requestBody
            )

        const ctx = createContext(
          {
            headers: {
              Accept: 'application/json',
              signature,
              'tenant-id': isOperator ? operator.id : tenant.id
            },
            url: '/graphql'
          },
          {},
          appContainer.container
        ) as TenantedAppContext

        ctx.request.body = requestBody

        const next = jest.fn()

        await expect(
          authenticatedTenantMiddleware(ctx, next)
        ).resolves.toBeUndefined()

        expect(ctx.tenantApiSignatureResult).toEqual(
          isOperator
            ? { tenant: operator, isOperator: true }
            : { tenant, isOperator: false }
        )
        expect(next).toHaveBeenCalled()
      }
    )

    test("throws when signature isn't signed with tenant secret", async (): Promise<void> => {
      const requestBody = { test: 'value' }
      const signature = generateApiSignature(
        'wrongsecret',
        Config.adminApiSignatureVersion,
        requestBody
      )
      const ctx = createContext<AppContext>(
        {
          headers: {
            Accept: 'application/json',
            signature,
            'tenant-id': tenant.id
          },
          url: '/graphql'
        },
        {},
        appContainer.container
      ) as TenantedAppContext
      ctx.request.body = requestBody

      const next = jest.fn()
      const ctxThrowSpy = jest.spyOn(ctx, 'throw')

      await expect(authenticatedTenantMiddleware(ctx, next)).rejects.toThrow()
      expect(next).not.toHaveBeenCalled()
      expect(ctxThrowSpy).toHaveBeenCalledWith(401, 'Unauthorized')
    })

    test('throws if tenant id is not included', async (): Promise<void> => {
      const requestBody = { test: 'value' }
      const signature = generateApiSignature(
        tenant.apiSecret,
        Config.adminApiSignatureVersion,
        requestBody
      )
      const ctx = createContext<AppContext>(
        {
          headers: {
            Accept: 'application/json',
            signature
          },
          url: '/graphql'
        },
        {},
        appContainer.container
      ) as TenantedAppContext

      ctx.request.body = requestBody

      const next = jest.fn()
      const ctxThrowSpy = jest.spyOn(ctx, 'throw')

      await expect(authenticatedTenantMiddleware(ctx, next)).rejects.toThrow()
      expect(next).not.toHaveBeenCalled()
      expect(ctxThrowSpy).toHaveBeenCalledWith(401, 'Unauthorized')
    })

    test('throws if signature is not included', async (): Promise<void> => {
      const requestBody = { test: 'value' }

      const ctx = createContext<AppContext>(
        {
          headers: {
            Accept: 'application/json'
          },
          url: '/graphql'
        },
        {},
        appContainer.container
      ) as TenantedAppContext

      ctx.request.body = requestBody

      const next = jest.fn()
      const ctxThrowSpy = jest.spyOn(ctx, 'throw')

      await expect(authenticatedTenantMiddleware(ctx, next)).rejects.toThrow()
      expect(next).not.toHaveBeenCalled()
      expect(ctxThrowSpy).toHaveBeenCalledWith(401, 'Unauthorized')
    })

    test('throws if signature is too old', async (): Promise<void> => {
      const requestBody = { test: 'value' }
      const signature = generateApiSignature(
        tenant.apiSecret,
        Config.adminApiSignatureVersion,
        requestBody,
        new Date().getTime() - config.adminApiSignatureTtlSeconds * 1000
      )

      const ctx = createContext<AppContext>(
        {
          headers: {
            Accept: 'application/json',
            signature,
            'tenant-id': tenant.id
          },
          url: '/graphql'
        },
        {},
        appContainer.container
      ) as TenantedAppContext

      ctx.request.body = requestBody

      const next = jest.fn()
      const ctxThrowSpy = jest.spyOn(ctx, 'throw')

      await expect(authenticatedTenantMiddleware(ctx, next)).rejects.toThrow()
      expect(next).not.toHaveBeenCalled()
      expect(ctxThrowSpy).toHaveBeenCalledWith(401, 'Unauthorized')
    })

    test('throws if signature has already been processed', async (): Promise<void> => {
      const requestBody = { test: 'value' }
      const signature = generateApiSignature(
        tenant.apiSecret,
        Config.adminApiSignatureVersion,
        requestBody
      )

      const ctx = createContext<AppContext>(
        {
          headers: {
            Accept: 'application/json',
            signature,
            'tenant-id': tenant.id
          },
          url: '/graphql'
        },
        {},
        appContainer.container
      ) as TenantedAppContext

      ctx.request.body = requestBody

      await expect(
        authenticatedTenantMiddleware(ctx, jest.fn())
      ).resolves.toBeUndefined()

      const next = jest.fn()
      const ctxThrowSpy = jest.spyOn(ctx, 'throw')

      await expect(authenticatedTenantMiddleware(ctx, next)).rejects.toThrow()
      expect(next).not.toHaveBeenCalled()
      expect(ctxThrowSpy).toHaveBeenCalledWith(401, 'Unauthorized')
    })

    test('throws if tenant does not exist', async (): Promise<void> => {
      const requestBody = { test: 'value' }
      const signature = generateApiSignature(
        tenant.apiSecret,
        Config.adminApiSignatureVersion,
        requestBody
      )
      const ctx = createContext<AppContext>(
        {
          headers: {
            Accept: 'application/json',
            signature,
            'tenant-id': crypto.randomUUID()
          },
          url: '/graphql'
        },
        {},
        appContainer.container
      ) as TenantedAppContext

      ctx.request.body = requestBody

      const next = jest.fn()
      const ctxThrowSpy = jest.spyOn(ctx, 'throw')

      await expect(authenticatedTenantMiddleware(ctx, next)).rejects.toThrow()
      expect(next).not.toHaveBeenCalled()
      expect(ctxThrowSpy).toHaveBeenCalledWith(401, 'Unauthorized')
    })
  })

  describe('unauthenticatedTenantMiddleware', (): void => {
    test.each`
      isOperator | description
      ${false}   | ${'tenanted non-operator'}
      ${true}    | ${'tenanted operator'}
    `(
      'returns if $description request has valid tenantId',
      async ({ isOperator }): Promise<void> => {
        const ctx = createContext(
          {
            headers: {
              Accept: 'application/json',
              'tenant-id': isOperator ? operator.id : tenant.id
            },
            url: '/graphql'
          },
          {},
          appContainer.container
        ) as TenantedAppContext

        const next = jest.fn()

        await expect(
          unauthenticatedTenantMiddleware(ctx, next)
        ).resolves.toBeUndefined()

        expect(ctx.tenantApiSignatureResult).toEqual(
          isOperator
            ? { tenant: operator, isOperator: true }
            : { tenant, isOperator: false }
        )
        expect(next).toHaveBeenCalled()
      }
    )

    test('returns if no tenantId provided', async (): Promise<void> => {
      const ctx = createContext(
        {
          headers: {
            Accept: 'application/json'
          },
          url: '/graphql'
        },
        {},
        appContainer.container
      ) as TenantedAppContext

      const next = jest.fn()
      const tenantGetSpy = jest.spyOn(tenantService, 'get')

      await expect(
        unauthenticatedTenantMiddleware(ctx, next)
      ).resolves.toBeUndefined()

      expect(ctx.tenantApiSignatureResult).toBeUndefined()
      expect(next).toHaveBeenCalled()
      expect(tenantGetSpy).not.toHaveBeenCalled()
    })

    test('throws if tenant does not exist', async (): Promise<void> => {
      const requestBody = { test: 'value' }
      const signature = generateApiSignature(
        tenant.apiSecret,
        Config.adminApiSignatureVersion,
        requestBody
      )
      const ctx = createContext<AppContext>(
        {
          headers: {
            Accept: 'application/json',
            signature,
            'tenant-id': crypto.randomUUID()
          },
          url: '/graphql'
        },
        {},
        appContainer.container
      ) as TenantedAppContext

      ctx.request.body = requestBody

      const next = jest.fn()
      const ctxThrowSpy = jest.spyOn(ctx, 'throw')

      await expect(unauthenticatedTenantMiddleware(ctx, next)).rejects.toThrow()
      expect(next).not.toHaveBeenCalled()
      expect(ctxThrowSpy).toHaveBeenCalledWith(401, 'Unauthorized')
    })
  })
})
