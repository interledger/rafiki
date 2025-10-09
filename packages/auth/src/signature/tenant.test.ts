import assert from 'assert'
import { IocContract } from '@adonisjs/fold'
import { faker } from '@faker-js/faker'
import Redis from 'ioredis'
import { initIocContainer } from '..'
import { AppServices, AppContext } from '../app'
import { IAppConfig, Config } from '../config/app'
import { Tenant } from '../tenant/model'
import { generateApiSignature } from '../tests/apiSignature'
import { TestContainer, createTestApp } from '../tests/app'
import { createContext } from '../tests/context'
import { truncateTables } from '../tests/tableManager'
import { getTenantFromApiSignature } from './tenant'

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
