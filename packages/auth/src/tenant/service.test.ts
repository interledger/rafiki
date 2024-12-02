import { faker } from '@faker-js/faker'
import { Knex } from 'knex'
import { createTestApp, TestContainer } from '../tests/app'
import { truncateTables } from '../tests/tableManager'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { TenantService } from './service'
import { Tenant } from './service'

describe('Tenant Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let tenantService: TenantService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)

    tenantService = await deps.use('tenantService')

    // TODO: remove. temporary implementation while other issue is completed
    const knex = await deps.use('knex')
    await knex.schema.createTable('tenants', (table) => {
      table.string('id').primary()
      table.string('idpConsentUrl').notNullable()
      table.string('idpSecret').notNullable()
    })
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

      expect(tenant).toMatchObject({
        id: tenantData.id,
        idpConsentUrl: tenantData.idpConsentUrl,
        idpSecret: tenantData.idpSecret
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
      expect(tenant).toMatchObject(tenantData)
    })

    test('returns undefined for non-existent tenant', async (): Promise<void> => {
      const tenant = await tenantService.get(faker.string.uuid())
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
      expect(updated).toMatchObject({
        id: created.id,
        ...updateData
      })
    })

    test('returns undefined for non-existent tenant', async (): Promise<void> => {
      const updated = await tenantService.update(faker.string.uuid(), {
        idpConsentUrl: faker.internet.url()
      })
      expect(updated).toBeUndefined()
    })

    test('can update partial fields', async (): Promise<void> => {
      const tenantData = createTenantData()
      const created = await tenantService.create(tenantData)

      const updateData = {
        idpConsentUrl: faker.internet.url()
      }

      const updated = await tenantService.update(created.id, updateData)
      expect(updated).toMatchObject({
        id: created.id,
        idpConsentUrl: updateData.idpConsentUrl,
        idpSecret: created.idpSecret
      })
    })
  })

  describe('delete', (): void => {
    test('deletes an existing tenant', async (): Promise<void> => {
      const tenantData = createTenantData()
      const created = await tenantService.create(tenantData)

      const result = await tenantService.delete(created.id)
      expect(result).toBe(true)

      const tenant = await tenantService.get(created.id)
      expect(tenant).toBeUndefined()
    })

    test('returns false for non-existent tenant', async (): Promise<void> => {
      const result = await tenantService.delete(faker.string.uuid())
      expect(result).toBe(false)
    })
  })
})
