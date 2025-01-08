import assert from 'assert'
import { faker } from '@faker-js/faker'
import { IocContract } from '@adonisjs/fold'
import nock from 'nock'
import { Knex } from 'knex'
import { AppServices } from '../app'
import { initIocContainer } from '..'
import { createTestApp, TestContainer } from '../tests/app'
import { TenantService } from './service'
import { Config, IAppConfig } from '../config/app'
import { ApolloClient, NormalizedCacheObject } from '@apollo/client'
import { Tenant } from './model'
import { getPageTests } from '../shared/baseModel.test'
import { Pagination, SortOrder } from '../shared/baseModel'
import { createTenant } from '../tests/tenant'
import { CacheDataStore } from '../middleware/cache/data-stores'

const generateMutateGqlError = (path: string = 'createTenant') => ({
  errors: [
    {
      message: 'invalid input syntax',
      locations: [
        {
          line: 1,
          column: 1
        }
      ],
      path: [path],
      extensions: {
        code: 'INTERNAl_SERVER_ERROR'
      }
    }
  ],
  data: null
})

describe('Tenant Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let tenantService: TenantService
  let config: IAppConfig
  let apolloClient: ApolloClient<NormalizedCacheObject>
  let knex: Knex

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    tenantService = await deps.use('tenantService')
    config = await deps.use('config')
    apolloClient = await deps.use('apolloClient')
    knex = await deps.use('knex')
  })

  afterEach(async (): Promise<void> => {
    await Tenant.query(knex).delete()
  })

  afterAll(async (): Promise<void> => {
    nock.cleanAll()
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

      const scope = nock(config.authAdminApiUrl)
        .post('')
        .reply(200, { data: { createTenant: { id: 1234 } } })

      const apolloSpy = jest.spyOn(apolloClient, 'mutate')
      const tenant = await tenantService.create(createOptions)

      expect(tenant).toEqual(expect.objectContaining(createOptions))

      expect(apolloSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: {
            input: {
              id: tenant.id,
              idpSecret: createOptions.idpSecret,
              idpConsentUrl: createOptions.idpConsentUrl
            }
          }
        })
      )

      scope.done()
    })

    test('tenant creation rolls back if auth tenant create fails', async (): Promise<void> => {
      const createOptions = {
        apiSecret: 'test-api-secret',
        publicName: 'test tenant',
        email: faker.internet.email(),
        idpConsentUrl: faker.internet.url(),
        idpSecret: 'test-idp-secret'
      }

      const scope = nock(config.authAdminApiUrl)
        .post('')
        .reply(200, generateMutateGqlError('createTenant'))

      const apolloSpy = jest.spyOn(apolloClient, 'mutate')
      let tenant
      try {
        tenant = await tenantService.create(createOptions)
      } catch (err) {
        expect(tenant).toBeUndefined()

        const tenants = await Tenant.query()
        expect(tenants.length).toEqual(0)

        expect(apolloSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            variables: {
              input: {
                id: expect.any(String),
                idpConsentUrl: createOptions.idpConsentUrl,
                idpSecret: createOptions.idpSecret
              }
            }
          })
        )
      }
      scope.done()
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

      const scope = nock(config.authAdminApiUrl)
        .post('')
        .reply(200, { data: { createTenant: { id: 1234 } } })
        .persist()
      const tenant = await tenantService.create(originalTenantInfo)

      const updatedTenantInfo = {
        id: tenant.id,
        apiSecret: 'test-api-secret-two',
        email: faker.internet.url(),
        publicName: 'second test name',
        idpConsentUrl: faker.internet.url(),
        idpSecret: 'test-idp-secret-two'
      }

      const apolloSpy = jest.spyOn(apolloClient, 'mutate')
      const updatedTenant = await tenantService.update(updatedTenantInfo)

      expect(updatedTenant).toEqual(expect.objectContaining(updatedTenantInfo))
      expect(apolloSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: {
            input: {
              id: tenant.id,
              idpConsentUrl: updatedTenantInfo.idpConsentUrl,
              idpSecret: updatedTenantInfo.idpSecret
            }
          }
        })
      )
      scope.done()
    })

    test('rolls back tenant if auth tenant update fails', async (): Promise<void> => {
      const originalTenantInfo = {
        apiSecret: 'test-api-secret',
        email: faker.internet.url(),
        publicName: 'test name',
        idpConsentUrl: faker.internet.url(),
        idpSecret: 'test-idp-secret'
      }

      nock(config.authAdminApiUrl)
        .post('')
        .reply(200, { data: { createTenant: { id: 1234 } } })
      const tenant = await tenantService.create(originalTenantInfo)
      const updatedTenantInfo = {
        id: tenant.id,
        apiSecret: 'test-api-secret-two',
        email: faker.internet.url(),
        publicName: 'second test name',
        idpConsentUrl: faker.internet.url(),
        idpSecret: 'test-idp-secret-two'
      }

      nock.cleanAll()

      nock(config.authAdminApiUrl)
        .post('')
        .reply(200, generateMutateGqlError('updateTenant'))
      const apolloSpy = jest.spyOn(apolloClient, 'mutate')
      let updatedTenant
      try {
        updatedTenant = await tenantService.update(updatedTenantInfo)
      } catch (err) {
        expect(updatedTenant).toBeUndefined()
        const dbTenant = await Tenant.query().findById(tenant.id)
        assert.ok(dbTenant)
        expect(dbTenant).toEqual(expect.objectContaining(originalTenantInfo))
        expect(apolloSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            variables: {
              input: {
                id: tenant.id,
                idpConsentUrl: updatedTenantInfo.idpConsentUrl,
                idpSecret: updatedTenantInfo.idpSecret
              }
            }
          })
        )
      }

      nock.cleanAll()
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

      const apolloSpy = jest.spyOn(apolloClient, 'mutate')
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
        expect(apolloSpy).toHaveBeenCalledTimes(0)
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

      const scope = nock(config.authAdminApiUrl)
        .post('')
        .reply(200, { data: { createTenant: { id: 1234 } } })
        .persist()
      const tenant = await tenantService.create(createOptions)

      const apolloSpy = jest.spyOn(apolloClient, 'mutate')
      await tenantService.delete(tenant.id)

      const dbTenant = await Tenant.query().findById(tenant.id)
      expect(dbTenant?.deletedAt?.getTime()).toBeLessThanOrEqual(
        new Date(Date.now()).getTime()
      )
      expect(apolloSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: {
            input: { id: tenant.id, deletedAt: dbTenant?.deletedAt }
          }
        })
      )

      scope.done()
    })

    test('Reverts deletion if auth tenant delete fails', async (): Promise<void> => {
      const createOptions = {
        apiSecret: 'test-api-secret',
        email: faker.internet.url(),
        publicName: 'test name',
        idpConsentUrl: faker.internet.url(),
        idpSecret: 'test-idp-secret'
      }

      nock(config.authAdminApiUrl)
        .post('')
        .reply(200, { data: { createTenant: { id: 1234 } } })
      const tenant = await tenantService.create(createOptions)

      nock.cleanAll()

      const apolloSpy = jest.spyOn(apolloClient, 'mutate')
      const deleteScope = nock(config.authAdminApiUrl)
        .post('')
        .reply(200, generateMutateGqlError('deleteTenant'))
      try {
        await tenantService.delete(tenant.id)
      } catch (err) {
        const dbTenant = await Tenant.query().findById(tenant.id)
        assert.ok(dbTenant)
        expect(dbTenant.id).toEqual(tenant.id)
        expect(dbTenant.deletedAt).toBeNull()
        expect(apolloSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            variables: {
              input: {
                id: tenant.id,
                deletedAt: expect.any(Date)
              }
            }
          })
        )
      }

      deleteScope.done()
    })
  })

  describe('Tenant Service using cache', (): void => {
    let deps: IocContract<AppServices>
    let appContainer: TestContainer
    let config: IAppConfig
    let tenantService: TenantService
    let tenantCache: CacheDataStore<Tenant>

    beforeAll(async (): Promise<void> => {
      deps = initIocContainer({
        ...Config,
        localCacheDuration: 5_000 // 5-second default.
      })
      appContainer = await createTestApp(deps)
      config = await deps.use('config')
      tenantService = await deps.use('tenantService')
      tenantCache = await deps.use('tenantCache')
    })

    afterEach(async (): Promise<void> => {
      await Tenant.query(appContainer.knex).delete()
    })

    afterAll(async (): Promise<void> => {
      await appContainer.shutdown()
    })

    describe('create, update, and retrieve tenant using cache', (): void => {
      test('Tenant can be created, updated, and fetched', async (): Promise<void> => {
        const createOptions = {
          email: faker.internet.email(),
          publicName: faker.company.name(),
          apiSecret: 'test-api-secret',
          idpConsentUrl: faker.internet.url(),
          idpSecret: 'test-idp-secret'
        }

        const scope = nock(config.authAdminApiUrl)
          .post('')
          .reply(200, { data: { createTenant: { tenant: { id: 1234 } } } })
          .persist()

        const spyCacheSet = jest.spyOn(tenantCache, 'set')
        const tenant = await tenantService.create(createOptions)
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
        const updatedTenant = await tenantService.update({
          id: tenant.id,
          apiSecret: 'test-api-secret-2'
        })

        await expect(tenantService.get(tenant.id)).resolves.toEqual(
          updatedTenant
        )

        // Ensure that cache was set for update
        expect(spyCacheUpdateSet).toHaveBeenCalledTimes(2)
        expect(spyCacheUpdateSet).toHaveBeenCalledWith(tenant.id, updatedTenant)

        const spyCacheDelete = jest.spyOn(tenantCache, 'delete')
        await tenantService.delete(tenant.id)

        await expect(tenantService.get(tenant.id)).resolves.toBeUndefined()

        // Ensure that cache was set for deletion
        expect(spyCacheDelete).toHaveBeenCalledTimes(1)
        expect(spyCacheDelete).toHaveBeenCalledWith(tenant.id)

        scope.done()
      })
    })
  })
})
