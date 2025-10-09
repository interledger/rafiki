import { IocContract } from '@adonisjs/fold'
import { Redis } from 'ioredis'
import assert from 'assert'
import { AppContext, AppServices } from '../app'
import { Config, IAppConfig } from '../config/app'
import { createContext } from '../tests/context'
import { generateApiSignature } from '../tests/apiSignature'
import { initIocContainer } from '..'
import { getTenantFromApiSignature, isValidDateString } from './utils'
import { TestContainer, createTestApp } from '../tests/app'
import { Tenant } from '../tenant/model'
import { truncateTables } from '../tests/tableManager'
import { faker } from '@faker-js/faker'

describe('Tenant Signature', (): void => {
  describe('getTenantFromApiSignature', (): void => {
    let deps: IocContract<AppServices>
    let appContainer: TestContainer
    let tenant: Tenant
    let operator: Tenant
    let config: IAppConfig
    let redis: Redis

    const operatorApiSecret = crypto.randomUUID()

    beforeAll(async (): Promise<void> => {
      deps = initIocContainer({
        ...Config,
        adminApiSecret: operatorApiSecret
      })
      appContainer = await createTestApp(deps)
      config = await deps.use('config')
      redis = await deps.use('redis')
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

        const ctx = createContext<AppContext>(
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
        )
        ctx.request.body = requestBody

        const result = await getTenantFromApiSignature(ctx, config)
        assert(result)
        expect(result.tenant).toEqual(isOperator ? operator : tenant)

        if (isOperator) {
          expect(result.isOperator).toEqual(true)
        } else {
          expect(result.isOperator).toEqual(false)
        }
      }
    )

    test("returns undefined when signature isn't signed with tenant secret", async (): Promise<void> => {
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
      )
      ctx.request.body = requestBody

      const result = await getTenantFromApiSignature(ctx, config)
      expect(result).toBeUndefined
    })

    test('returns undefined if tenant id is not included', async (): Promise<void> => {
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
      )

      ctx.request.body = requestBody

      const result = await getTenantFromApiSignature(ctx, config)
      expect(result).toBeUndefined()
    })

    test('returns undefined if tenant does not exist', async (): Promise<void> => {
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
      )

      ctx.request.body = requestBody

      const tenantService = await deps.use('tenantService')
      const getSpy = jest.spyOn(tenantService, 'get')
      const result = await getTenantFromApiSignature(ctx, config)
      expect(result).toBeUndefined()
      expect(getSpy).toHaveBeenCalled()
    })
  })

  describe('isValidDateString', () => {
    test.each([
      ['2024-12-05T15:10:09.545Z', true],
      ['2024-12-05', true],
      ['invalid-date', false], // Invalid date string
      ['2024-12-05T25:10:09.545Z', false], // Invalid date string (invalid hour)
      ['"2024-12-05T15:10:09.545Z"', false], // Improperly formatted string
      ['', false], // Empty string
      [null, false], // Null value
      [undefined, false] // Undefined value
    ])('should return %p for input %p', (input, expected) => {
      expect(isValidDateString(input!)).toBe(expected)
    })
  })
})
