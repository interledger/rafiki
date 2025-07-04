import assert from 'assert'
import { faker } from '@faker-js/faker'
import { IocContract } from '@adonisjs/fold'
import { Knex } from 'knex'
import { AppServices } from '../app'
import { initIocContainer } from '..'
import { createTestApp, TestContainer } from '../tests/app'
import { TenantService } from './service'
import { Config, IAppConfig } from '../config/app'
import { truncateTables } from '../tests/tableManager'
import { Tenant } from './model'
import { getPageTests } from '../shared/baseModel.test'
import { Pagination, SortOrder } from '../shared/baseModel'
import { createTenant } from '../tests/tenant'
import { CacheDataStore } from '../middleware/cache/data-stores'
import { AuthServiceClient } from '../auth-service-client/client'
import { withConfigOverride } from '../tests/helpers'
import { TenantSetting, TenantSettingKeys } from './settings/model'
import { TenantSettingService } from './settings/service'
import { isTenantError, TenantError } from './errors'
import { v4 } from 'uuid'

describe('Tenant Service', (): void => {
  let deps: IocContract<AppServices>
  let config: IAppConfig
  let appContainer: TestContainer
  let tenantService: TenantService
  let knex: Knex
  const dbSchema = 'tenant_service_test_schema'
  let authServiceClient: AuthServiceClient
  let tenantSettingsService: TenantSettingService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({
      ...Config,
      dbSchema
    })
    knex = await deps.use('knex')
    config = await deps.use('config')
    appContainer = await createTestApp(deps)
    tenantService = await deps.use('tenantService')
    authServiceClient = await deps.use('authServiceClient')
    tenantSettingsService = await deps.use('tenantSettingService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps, { truncateTenants: true })
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Tenant pagination', (): void => {
    describe('getPage', (): void => {
      getPageTests({
        createModel: () => createTenant(deps),
        getPage: (pagination?: Pagination, sortOrder?: SortOrder) =>
          tenantService.getPage(pagination, sortOrder)
      })
    })
  })

  describe('get', (): void => {
    test('can get a tenant', async (): Promise<void> => {
      const createOptions = {
        apiSecret: 'test-api-secret',
        publicName: 'test tenant',
        email: faker.internet.email(),
        idpConsentUrl: faker.internet.url(),
        idpSecret: 'test-idp-secret'
      }

      const createdTenant =
        await Tenant.query(knex).insertAndFetch(createOptions)

      const tenant = await tenantService.get(createdTenant.id)
      assert.ok(tenant)
      expect(tenant).toEqual(createdTenant)
    })

    test('returns deletedAt set if tenant is deleted', async (): Promise<void> => {
      const dbTenant = await Tenant.query(knex).insertAndFetch({
        apiSecret: 'test-secret',
        email: faker.internet.email(),
        idpConsentUrl: faker.internet.url(),
        idpSecret: 'test-idp-secret',
        deletedAt: new Date()
      })

      const tenant = await tenantService.get(dbTenant.id)
      expect(tenant).toBeUndefined()

      // Ensure Operator is able to access tenant even if deleted:
      const tenantDel = await tenantService.get(dbTenant.id, true)
      expect(tenantDel?.deletedAt).toBeDefined()
    })

    test('returns undefined if tenant is deleted', async (): Promise<void> => {
      const dbTenant = await Tenant.query(knex).insertAndFetch({
        apiSecret: 'test-secret',
        email: faker.internet.email(),
        idpConsentUrl: faker.internet.url(),
        idpSecret: 'test-idp-secret',
        deletedAt: new Date()
      })

      const tenant = await tenantService.get(dbTenant.id)
      expect(tenant).toBeUndefined()

      // Ensure Operator is able to access tenant even if deleted:
      const tenantDel = await tenantService.get(dbTenant.id, true)
      expect(tenantDel?.deletedAt).toBeDefined()
    })
  })

  describe('create', (): void => {
    test('can create a tenant', async (): Promise<void> => {
      const createOptions = {
        apiSecret: 'test-api-secret',
        publicName: 'test tenant',
        email: faker.internet.email(),
        idpConsentUrl: faker.internet.url(),
        idpSecret: 'test-idp-secret'
      }

      const spy = jest
        .spyOn(authServiceClient.tenant, 'create')
        .mockImplementationOnce(async () => undefined)

      const tenant = await tenantService.create(createOptions)
      assert(!isTenantError(tenant))
      expect(tenant).toEqual(expect.objectContaining(createOptions))

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: tenant.id,
          idpSecret: createOptions.idpSecret,
          idpConsentUrl: createOptions.idpConsentUrl
        })
      )

      const tenantSettings = await TenantSetting.query().where(
        'tenantId',
        tenant.id
      )
      expect(tenantSettings.length).toBeGreaterThan(0)
    })

    test('can create a tenant with a setting', async () => {
      const walletAddressUrl = 'https://example.com'
      const createOptions = {
        apiSecret: 'test-api-secret',
        publicName: 'test tenant',
        email: faker.internet.email(),
        idpConsentUrl: faker.internet.url(),
        idpSecret: 'test-idp-secret',
        settings: [
          {
            key: TenantSettingKeys.WALLET_ADDRESS_URL.name,
            value: walletAddressUrl
          }
        ]
      }

      jest
        .spyOn(authServiceClient.tenant, 'create')
        .mockImplementationOnce(async () => undefined)

      const tenant = await tenantService.create(createOptions)
      assert(!isTenantError(tenant))
      const tenantSetting = await TenantSetting.query()
        .where('tenantId', tenant.id)
        .andWhere('key', TenantSettingKeys.WALLET_ADDRESS_URL.name)

      expect(tenantSetting.length).toBe(1)
      expect(tenantSetting[0].value).toEqual(walletAddressUrl)
    })

    test('can create tenant with a specified id', async (): Promise<void> => {
      const inputId = v4()
      const createOptions = {
        id: inputId,
        apiSecret: 'test-api-secret',
        publicName: 'test tenant',
        email: faker.internet.email(),
        idpConsentUrl: faker.internet.url(),
        idpSecret: 'test-idp-secret'
      }

      jest
        .spyOn(authServiceClient.tenant, 'create')
        .mockImplementationOnce(async () => undefined)

      const tenant = await tenantService.create(createOptions)
      assert(!isTenantError(tenant))
      expect(tenant.id).toEqual(inputId)
    })

    test('tenant creation rolls back if auth tenant create fails', async (): Promise<void> => {
      const createOptions = {
        apiSecret: 'test-api-secret',
        publicName: 'test tenant',
        email: faker.internet.email(),
        idpConsentUrl: faker.internet.url(),
        idpSecret: 'test-idp-secret'
      }

      const spy = jest
        .spyOn(authServiceClient.tenant, 'create')
        .mockImplementationOnce(() => {
          throw new Error()
        })

      expect.assertions(3)
      let tenant
      try {
        tenant = await tenantService.create(createOptions)
      } catch (err) {
        expect(tenant).toBeUndefined()

        const tenants = await Tenant.query()
        expect(tenants.length).toEqual(0)

        expect(spy).toHaveBeenCalledWith(
          expect.objectContaining({
            id: expect.any(String),
            idpConsentUrl: createOptions.idpConsentUrl,
            idpSecret: createOptions.idpSecret
          })
        )
      }
    })
  })

  describe('update', (): void => {
    test('can update a tenant', async (): Promise<void> => {
      const originalTenantInfo = {
        apiSecret: 'test-api-secret',
        email: faker.internet.url(),
        publicName: 'test name',
        idpConsentUrl: faker.internet.url(),
        idpSecret: 'test-idp-secret'
      }

      jest
        .spyOn(authServiceClient.tenant, 'create')
        .mockImplementationOnce(async () => undefined)

      const tenant = await tenantService.create(originalTenantInfo)
      assert(!isTenantError(tenant))

      const updatedTenantInfo = {
        id: tenant.id,
        apiSecret: 'test-api-secret-two',
        email: faker.internet.url(),
        publicName: 'second test name',
        idpConsentUrl: faker.internet.url(),
        idpSecret: 'test-idp-secret-two'
      }

      const spy = jest
        .spyOn(authServiceClient.tenant, 'update')
        .mockImplementationOnce(async () => undefined)
      const updatedTenant = await tenantService.update(updatedTenantInfo)

      expect(updatedTenant).toEqual(expect.objectContaining(updatedTenantInfo))
      expect(spy).toHaveBeenCalledWith(tenant.id, {
        idpConsentUrl: updatedTenantInfo.idpConsentUrl,
        idpSecret: updatedTenantInfo.idpSecret
      })
    })

    test('rolls back tenant if auth tenant update fails', async (): Promise<void> => {
      const originalTenantInfo = {
        apiSecret: 'test-api-secret',
        email: faker.internet.url(),
        publicName: 'test name',
        idpConsentUrl: faker.internet.url(),
        idpSecret: 'test-idp-secret'
      }

      jest
        .spyOn(authServiceClient.tenant, 'create')
        .mockImplementationOnce(async () => undefined)

      const tenant = await tenantService.create(originalTenantInfo)
      assert(!isTenantError(tenant))
      const updatedTenantInfo = {
        id: tenant.id,
        apiSecret: 'test-api-secret-two',
        email: faker.internet.url(),
        publicName: 'second test name',
        idpConsentUrl: faker.internet.url(),
        idpSecret: 'test-idp-secret-two'
      }

      const spy = jest
        .spyOn(authServiceClient.tenant, 'update')
        .mockImplementationOnce(async () => {
          throw new Error()
        })

      let updatedTenant
      expect.assertions(3)
      try {
        updatedTenant = await tenantService.update(updatedTenantInfo)
      } catch (err) {
        expect(updatedTenant).toBeUndefined()
        const dbTenant = await Tenant.query().findById(tenant.id)
        assert.ok(dbTenant)
        expect(dbTenant).toEqual(expect.objectContaining(originalTenantInfo))
        expect(spy).toHaveBeenCalledWith(
          tenant.id,
          expect.objectContaining({
            idpConsentUrl: updatedTenantInfo.idpConsentUrl,
            idpSecret: updatedTenantInfo.idpSecret
          })
        )
      }
    })

    test('Cannot update deleted tenant', async (): Promise<void> => {
      const originalSecret = 'test-secret'
      const dbTenant = await Tenant.query(knex).insertAndFetch({
        email: faker.internet.url(),
        apiSecret: originalSecret,
        idpSecret: 'test-idp-secret',
        idpConsentUrl: faker.internet.url(),
        deletedAt: new Date()
      })

      const spy = jest.spyOn(authServiceClient.tenant, 'update')
      try {
        await tenantService.update({
          id: dbTenant.id,
          apiSecret: 'test-secret-2'
        })
      } catch (err) {
        const dbTenantAfterUpdate = await Tenant.query(knex).findById(
          dbTenant.id
        )

        assert.ok(dbTenantAfterUpdate)
        expect(dbTenantAfterUpdate.apiSecret).toEqual(originalSecret)
        expect(spy).toHaveBeenCalledTimes(0)
      }
    })
  })

  describe('Delete Tenant', (): void => {
    test('Can delete tenant', async (): Promise<void> => {
      const createOptions = {
        apiSecret: 'test-api-secret',
        email: faker.internet.url(),
        publicName: 'test name',
        idpConsentUrl: faker.internet.url(),
        idpSecret: 'test-idp-secret'
      }

      jest
        .spyOn(authServiceClient.tenant, 'create')
        .mockImplementationOnce(async () => undefined)
      const tenant = await tenantService.create(createOptions)
      assert(!isTenantError(tenant))

      const spy = jest
        .spyOn(authServiceClient.tenant, 'delete')
        .mockImplementationOnce(async () => undefined)
      await tenantService.delete(tenant.id)

      const dbTenant = await Tenant.query().findById(tenant.id)
      assert.ok(dbTenant?.deletedAt)
      expect(dbTenant.deletedAt.getTime()).toBeLessThanOrEqual(
        new Date(Date.now()).getTime()
      )
      expect(spy).toHaveBeenCalledWith(tenant.id, dbTenant.deletedAt)

      const settings = (await tenantSettingsService.get({
        tenantId: tenant.id
      })) as TenantSetting[]
      expect(settings.length).toBe(0)
    })

    test('Reverts deletion if auth tenant delete fails', async (): Promise<void> => {
      const createOptions = {
        apiSecret: 'test-api-secret',
        email: faker.internet.url(),
        publicName: 'test name',
        idpConsentUrl: faker.internet.url(),
        idpSecret: 'test-idp-secret'
      }

      jest
        .spyOn(authServiceClient.tenant, 'create')
        .mockImplementationOnce(async () => undefined)
      const tenant = await tenantService.create(createOptions)
      assert(!isTenantError(tenant))

      const spy = jest
        .spyOn(authServiceClient.tenant, 'delete')
        .mockImplementationOnce(async () => {
          throw new Error()
        })

      expect.assertions(3)
      try {
        await tenantService.delete(tenant.id)
      } catch (err) {
        const dbTenant = await Tenant.query().findById(tenant.id)
        assert.ok(dbTenant)
        expect(dbTenant.id).toEqual(tenant.id)
        expect(dbTenant.deletedAt).toBeNull()
        expect(spy).toHaveBeenCalledWith(tenant.id, expect.any(Date))
      }
    })
  })

  describe('Tenant Service using cache', (): void => {
    let tenantCache: CacheDataStore<Tenant>
    let authServiceClient: AuthServiceClient

    beforeAll(async (): Promise<void> => {
      tenantCache = await deps.use('tenantCache')
      authServiceClient = await deps.use('authServiceClient')
    })

    describe('create, update, and retrieve tenant using cache', (): void => {
      test(
        'Tenant can be created, updated, and fetched',
        withConfigOverride(
          () => config,
          { localCacheDuration: 5_000 },
          async (): Promise<void> => {
            const createOptions = {
              email: faker.internet.email(),
              publicName: faker.company.name(),
              apiSecret: 'test-api-secret',
              idpConsentUrl: faker.internet.url(),
              idpSecret: 'test-idp-secret'
            }

            jest
              .spyOn(authServiceClient.tenant, 'create')
              .mockImplementation(async () => undefined)

            const spyCacheSet = jest.spyOn(tenantCache, 'set')
            const tenant = await tenantService.create(createOptions)
            assert(!isTenantError(tenant))
            expect(tenant).toMatchObject({
              ...createOptions,
              id: tenant.id
            })

            // Ensure that the cache was set for create
            expect(spyCacheSet).toHaveBeenCalledTimes(1)

            const spyCacheGet = jest.spyOn(tenantCache, 'get')
            await expect(tenantService.get(tenant.id)).resolves.toEqual(tenant)

            expect(spyCacheGet).toHaveBeenCalledTimes(1)
            expect(spyCacheGet).toHaveBeenCalledWith(tenant.id)

            const spyCacheUpdateSet = jest.spyOn(tenantCache, 'set')
            jest
              .spyOn(authServiceClient.tenant, 'update')
              .mockImplementation(async () => undefined)
            const updatedTenant = await tenantService.update({
              id: tenant.id,
              apiSecret: 'test-api-secret-2'
            })

            await expect(tenantService.get(tenant.id)).resolves.toEqual(
              updatedTenant
            )

            // Ensure that cache was set for update
            expect(spyCacheUpdateSet).toHaveBeenCalledTimes(2)
            expect(spyCacheUpdateSet).toHaveBeenCalledWith(
              tenant.id,
              updatedTenant
            )

            const spyCacheDelete = jest.spyOn(tenantCache, 'delete')
            jest
              .spyOn(authServiceClient.tenant, 'delete')
              .mockImplementation(async () => undefined)
            await tenantService.delete(tenant.id)

            await expect(tenantService.get(tenant.id)).resolves.toBeUndefined()

            // Ensure that cache was set for deletion
            expect(spyCacheDelete).toHaveBeenCalledTimes(1)
            expect(spyCacheDelete).toHaveBeenCalledWith(tenant.id)

            // Ensure Operator is able to access tenant even if deleted:
            const tenantDel = await tenantService.get(tenant.id, true)
            expect(tenantDel?.deletedAt).toBeDefined()
          }
        )
      )
    })
  })
})

describe('Tenant Service (no tenant truncate)', (): void => {
  let deps: IocContract<AppServices>
  let config: IAppConfig
  let appContainer: TestContainer
  let tenantService: TenantService
  let knex: Knex
  let tenantCache: CacheDataStore<Tenant>
  let updateSpyWasCalled: boolean
  const dbSchema = 'tenant_service_test_schema2'

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({
      ...Config,
      dbSchema
    })
    knex = await deps.use('knex')
    config = await deps.use('config')
    tenantService = await deps.use('tenantService')
    tenantCache = await deps.use('tenantCache')

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
  describe('updateOperatorApiSecretFromConfig', () => {
    test('called on application start', async (): Promise<void> => {
      expect(updateSpyWasCalled).toBe(true)
    })

    test('updates secret if changed', async (): Promise<void> => {
      // Setup operator with different secret than the config.
      // As-if the api secret was set from a different config value originally.
      const initialApiSecret = '123'
      assert(initialApiSecret !== config.adminApiSecret)
      const tenant = await Tenant.query(knex).patchAndFetchById(
        config.operatorTenantId,
        { apiSecret: initialApiSecret }
      )
      assert(tenant)
      expect(tenant.apiSecret).toBe(initialApiSecret)

      const error = await tenantService.updateOperatorApiSecretFromConfig()
      expect(error).toBe(undefined)

      const updated = await Tenant.query(knex).findById(tenant.id)
      assert(updated)
      expect(updated.apiSecret).toBe(config.adminApiSecret)

      const cacheUpdated = await tenantCache.get(tenant.id)
      assert(cacheUpdated)
      expect(cacheUpdated.apiSecret).toBe(config.adminApiSecret)
    })
    test('does not update if secret hasnt changed', async (): Promise<void> => {
      const tenant = await Tenant.query(knex).findById(config.operatorTenantId)
      assert(tenant)
      assert(tenant.apiSecret === config.adminApiSecret)

      const error = await tenantService.updateOperatorApiSecretFromConfig()

      expect(error).toBe(undefined)

      const updated = await Tenant.query(knex).findById(tenant.id)
      assert(updated)
      expect(updated.updatedAt).toStrictEqual(tenant.updatedAt)
    })
    test(
      'throws error if operator tenant not found',
      withConfigOverride(
        () => config,
        { operatorTenantId: crypto.randomUUID() },
        async (): Promise<void> => {
          const error = await tenantService.updateOperatorApiSecretFromConfig()

          expect(isTenantError(error)).toBe(true)
          expect(error).toEqual(TenantError.TenantNotFound)
        }
      )
    )
  })
})
