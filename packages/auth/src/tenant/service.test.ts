import assert from 'assert'
import { faker } from '@faker-js/faker'
import { createTestApp, TestContainer } from '../tests/app'
import { truncateTables } from '../tests/tableManager'
import { Config, IAppConfig } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { TenantService } from './service'
import { Tenant } from './model'
import { withConfigOverride } from '../tests/helpers'

describe('Tenant Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let tenantService: TenantService

  const dbSchema = 'tenant_service_test_schema'

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({ ...Config, dbSchema })
    appContainer = await createTestApp(deps)
    tenantService = await deps.use('tenantService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  const createTenantData = () => ({
    id: faker.string.uuid(),
    apiSecret: faker.string.hexadecimal(),
    idpConsentUrl: faker.internet.url(),
    idpSecret: faker.string.alphanumeric(32)
  })

  describe('create', (): void => {
    test('creates a tenant', async (): Promise<void> => {
      const tenantData = createTenantData()
      const tenant = await tenantService.create(tenantData)

      expect(tenant).toEqual({
        id: tenantData.id,
        apiSecret: tenantData.apiSecret,
        idpConsentUrl: tenantData.idpConsentUrl,
        idpSecret: tenantData.idpSecret,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        deletedAt: undefined
      })
    })

    test('fails to create tenant with duplicate id', async (): Promise<void> => {
      const tenantData = createTenantData()
      await tenantService.create(tenantData)

      await expect(tenantService.create(tenantData)).rejects.toThrow()
    })
  })

  describe('get', (): void => {
    test('retrieves an existing tenant', async (): Promise<void> => {
      const tenantData = createTenantData()
      const created = await tenantService.create(tenantData)

      const tenant = await tenantService.get(created.id)
      expect(tenant).toEqual({
        id: tenantData.id,
        apiSecret: tenantData.apiSecret,
        idpConsentUrl: tenantData.idpConsentUrl,
        idpSecret: tenantData.idpSecret,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        deletedAt: null
      })
    })

    test('returns undefined for non-existent tenant', async (): Promise<void> => {
      const tenant = await tenantService.get(faker.string.uuid())
      expect(tenant).toBeUndefined()
    })

    test('returns undefined for soft deleted tenant', async (): Promise<void> => {
      const tenantData = createTenantData()
      const created = await tenantService.create(tenantData)
      await tenantService.delete(created.id, new Date())

      const tenant = await tenantService.get(created.id)
      expect(tenant).toBeUndefined()
    })
  })

  describe('update', (): void => {
    test('updates an existing tenant', async (): Promise<void> => {
      const tenantData = createTenantData()
      const created = await tenantService.create(tenantData)

      const updateData = {
        apiSecret: faker.string.hexadecimal(),
        idpConsentUrl: faker.internet.url(),
        idpSecret: faker.string.alphanumeric(32)
      }

      const updated = await tenantService.update(created.id, updateData)
      expect(updated).toEqual({
        id: created.id,
        ...updateData,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        deletedAt: null
      })
    })

    test('can update partial fields', async (): Promise<void> => {
      const tenantData = createTenantData()
      const created = await tenantService.create(tenantData)

      const updateData = {
        idpConsentUrl: faker.internet.url()
      }

      const updated = await tenantService.update(created.id, updateData)
      expect(updated).toEqual({
        id: created.id,
        apiSecret: tenantData.apiSecret,
        idpConsentUrl: updateData.idpConsentUrl,
        idpSecret: created.idpSecret,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        deletedAt: null
      })
    })

    test('returns undefined for non-existent tenant', async (): Promise<void> => {
      const updated = await tenantService.update(faker.string.uuid(), {
        idpConsentUrl: faker.internet.url()
      })
      expect(updated).toBeUndefined()
    })

    test('returns undefined for soft-deleted tenant', async (): Promise<void> => {
      const tenantData = createTenantData()
      const created = await tenantService.create(tenantData)
      await tenantService.delete(created.id, new Date())

      const updated = await tenantService.update(created.id, {
        idpConsentUrl: faker.internet.url()
      })
      expect(updated).toBeUndefined()
    })
  })

  describe('delete', (): void => {
    test('soft deletes an existing tenant', async (): Promise<void> => {
      const tenantData = createTenantData()
      const created = await tenantService.create(tenantData)

      const result = await tenantService.delete(created.id, new Date())
      expect(result).toBe(true)

      const tenant = await tenantService.get(created.id)
      expect(tenant).toBeUndefined()

      const deletedTenant = await Tenant.query()
        .findById(created.id)
        .whereNotNull('deletedAt')
      expect(deletedTenant).toBeDefined()
      expect(deletedTenant?.deletedAt).toBeDefined()
    })

    test('returns false for non-existent tenant', async (): Promise<void> => {
      const result = await tenantService.delete(faker.string.uuid(), new Date())
      expect(result).toBe(false)
    })

    test('returns false for already deleted tenant', async (): Promise<void> => {
      const tenantData = createTenantData()
      const created = await tenantService.create(tenantData)

      await tenantService.delete(created.id, new Date())
      const secondDelete = await tenantService.delete(created.id, new Date())
      expect(secondDelete).toBe(false)
    })
  })
})

describe('updateOperatorApiSecretFromConfig', () => {
  let deps: IocContract<AppServices>
  let config: IAppConfig
  let appContainer: TestContainer
  let tenantService: TenantService
  let updateSpyWasCalled: boolean
  const dbSchema = 'tenant_service_test_schema2'

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({
      ...Config,
      dbSchema
    })
    config = await deps.use('config')
    tenantService = await deps.use('tenantService')

    const updateOperatorSecretSpy = jest.spyOn(
      tenantService,
      'updateOperatorApiSecretFromConfig'
    )
    appContainer = await createTestApp(deps)
    updateSpyWasCalled = updateOperatorSecretSpy.mock.calls.length > 0
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  test('called on application start', async (): Promise<void> => {
    expect(updateSpyWasCalled).toBe(true)
  })

  test('updates secret if changed', async (): Promise<void> => {
    // Setup operator with different secret than the config.
    // As-if the api secret was set from a different config value originally.
    const initialApiSecret = '123'
    assert(initialApiSecret !== config.adminApiSecret)
    const tenant = await Tenant.query().patchAndFetchById(
      config.operatorTenantId,
      { apiSecret: initialApiSecret }
    )
    assert(tenant)
    expect(tenant.apiSecret).toBe(initialApiSecret)

    await tenantService.updateOperatorApiSecretFromConfig()

    const updated = await Tenant.query().findById(tenant.id)
    assert(updated)
    expect(updated.apiSecret).toBe(config.adminApiSecret)
  })

  test('does not update if secret hasnt changed', async (): Promise<void> => {
    const tenant = await Tenant.query().findById(config.operatorTenantId)
    assert(tenant)
    assert(tenant.apiSecret === config.adminApiSecret)

    await tenantService.updateOperatorApiSecretFromConfig()

    const updated = await Tenant.query().findById(tenant.id)
    assert(updated)
    expect(updated.updatedAt).toStrictEqual(tenant.updatedAt)
  })

  test(
    'throws error if operator tenant not found',
    withConfigOverride(
      () => config,
      { operatorTenantId: crypto.randomUUID() },
      async (): Promise<void> => {
        await expect(
          tenantService.updateOperatorApiSecretFromConfig()
        ).rejects.toThrow('')
      }
    )
  )
})
