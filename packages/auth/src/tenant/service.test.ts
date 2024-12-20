import { faker } from '@faker-js/faker'
import { createTestApp, TestContainer } from '../tests/app'
import { truncateTables } from '../tests/tableManager'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { TenantService } from './service'
import { Tenant } from './model'

describe('Tenant Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let tenantService: TenantService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)

    tenantService = await deps.use('tenantService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  const createTenantData = () => ({
    id: faker.string.uuid(),
    idpConsentUrl: faker.internet.url(),
    idpSecret: faker.string.alphanumeric(32)
  })

  describe('create', (): void => {
    test('creates a tenant', async (): Promise<void> => {
      const tenantData = createTenantData()
      const tenant = await tenantService.create(tenantData)

      expect(tenant).toEqual({
        id: tenantData.id,
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
