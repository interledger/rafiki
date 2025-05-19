import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { createTestApp, TestContainer } from '../../tests/app'
import nock from 'nock'
import { truncateTables } from '../../tests/tableManager'
import { Tenant } from '../model'
import { TenantService } from '../service'
import { faker } from '@faker-js/faker'
import { exchangeRatesSetting, randomSetting } from '../../tests/tenantSettings'
import { TenantSetting, TenantSettingKeys } from './model'
import {
  CreateOptions,
  GetOptions,
  TenantSettingService,
  UpdateOptions
} from './service'
import { AuthServiceClient } from '../../auth-service-client/client'
import { v4 as uuid } from 'uuid'
import { createTenant } from '../../tests/tenant'

describe('TenantSetting Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let tenant: Tenant
  let tenantService: TenantService
  let tenantSettingService: TenantSettingService
  let authServiceClient: AuthServiceClient

  const dbSchema = 'tenant_settings_service_test_schema'

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({ ...Config, dbSchema })
    appContainer = await createTestApp(deps)

    tenantService = await deps.use('tenantService')
    tenantSettingService = await deps.use('tenantSettingService')
    authServiceClient = await deps.use('authServiceClient')
  })

  beforeEach(async (): Promise<void> => {
    jest
      .spyOn(authServiceClient.tenant, 'create')
      .mockResolvedValueOnce(undefined)

    jest
      .spyOn(authServiceClient.tenant, 'delete')
      .mockResolvedValueOnce(undefined)

    tenant = await tenantService.create({
      apiSecret: faker.string.uuid(),
      email: faker.internet.email(),
      idpConsentUrl: faker.internet.url(),
      idpSecret: faker.string.uuid()
    })
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps, { truncateTenants: true })
  })

  afterAll(async (): Promise<void> => {
    nock.cleanAll()
    await appContainer.shutdown()
  })

  describe('create', () => {
    test('can create a tenant setting', async (): Promise<void> => {
      const createOptions: CreateOptions = {
        tenantId: tenant.id,
        setting: [exchangeRatesSetting()]
      }

      const tenantSetting = await tenantSettingService.create(createOptions)

      expect(tenantSetting).toEqual([
        expect.objectContaining({
          tenantId: tenant.id,
          key: createOptions.setting[0].key,
          value: createOptions.setting[0].value
        })
      ])
    })

    test('returns empty array if setting key is not allowed', async (): Promise<void> => {
      const createOptions: CreateOptions = {
        tenantId: tenant.id,
        setting: [randomSetting()]
      }

      const tenantSetting = await tenantSettingService.create(createOptions)

      expect(tenantSetting).toEqual([])
    })

    test('should update existing tenant settings on conflict - upsert', async (): Promise<void> => {
      const initialOptions: CreateOptions = {
        tenantId: tenant.id,
        setting: [exchangeRatesSetting()]
      }

      await tenantSettingService.create(initialOptions)

      const newValue = faker.internet.url()
      const updatedOptions: CreateOptions = {
        tenantId: tenant.id,
        setting: [
          {
            key: initialOptions.setting[0].key,
            value: newValue
          }
        ]
      }

      await tenantSettingService.create(updatedOptions)
      const result = (await tenantSettingService.get({
        tenantId: tenant.id,
        key: initialOptions.setting[0].key
      })) as TenantSetting[]

      expect(result).toHaveLength(1)
      expect(result[0].key).toEqual(initialOptions.setting[0].key)
      expect(result[0].value).toEqual(newValue)
    })
  })

  describe('get', () => {
    let tenantSetting: TenantSetting[]

    function createTenantSetting() {
      const options: CreateOptions = {
        tenantId: tenant.id,
        setting: [randomSetting()]
      }

      return tenantSettingService.create(options)
    }

    beforeEach(async (): Promise<void> => {
      await createTenantSetting()
      tenantSetting = (await tenantSettingService.get({
        tenantId: tenant.id
      })) as TenantSetting[]
    })

    afterEach(async (): Promise<void> => {
      return tenantSettingService.delete({
        tenantId: tenant.id
      })
    })

    test('should get tenant setting', async () => {
      const dbTenantSetting = await tenantSettingService.get({
        tenantId: tenant.id,
        key: tenantSetting[0].key
      })

      expect(dbTenantSetting).toEqual([tenantSetting[0]])
    })

    test('should get all tenant settings', async () => {
      const newTenantSetting = await createTenantSetting()
      const dbTenantSettings = await tenantSettingService.get({
        tenantId: tenant.id
      })

      const settings = tenantSetting.concat(newTenantSetting)

      expect(dbTenantSettings).toEqual(settings)
    })

    test('should not get deleted tenant', async () => {
      const options: GetOptions = {
        tenantId: tenant.id,
        key: tenantSetting[0].key
      }

      await tenantSettingService.delete(options)
      const dbTenantSetting = await tenantSettingService.get(options)

      expect(dbTenantSetting).toHaveLength(0)
    })
  })

  describe('update', () => {
    let updateOptions: UpdateOptions

    beforeEach(async () => {
      updateOptions = {
        tenantId: tenant.id,
        ...exchangeRatesSetting()
      }

      await tenantSettingService.create({
        tenantId: updateOptions.tenantId,
        setting: [{ key: updateOptions.key, value: updateOptions.value }]
      })
    })

    test('can update own setting', async () => {
      const newValues = {
        ...updateOptions,
        value: 'test'
      }
      await tenantSettingService.update(newValues)

      const res = await tenantSettingService.get({
        tenantId: newValues.tenantId,
        key: newValues.key
      })

      expect(res).toEqual(
        expect.arrayContaining([expect.objectContaining(newValues)])
      )
    })
  })

  describe('delete', (): void => {
    describe('delete tenant', () => {
      it('should delete tenant settings if tenant is deleted', async () => {
        await tenantService.delete(tenant.id)
        const found = await Tenant.query()
          .findById(tenant.id)
          .withGraphFetched('settings')

        for (const tenantSetting of found?.settings as TenantSetting[]) {
          expect(found?.deletedAt).toEqual(tenantSetting.deletedAt)
        }
      })
    })
    test('can delete tenant setting key', async (): Promise<void> => {
      const createOptions: CreateOptions = {
        tenantId: tenant.id,
        setting: [exchangeRatesSetting()]
      }

      const tenantSetting = await tenantSettingService.create(createOptions)
      await tenantSettingService.delete({
        tenantId: tenantSetting[0].tenantId,
        key: createOptions.setting[0].key
      })

      const dbTenantSetting = await TenantSetting.query().findById(
        tenantSetting[0].id
      )
      expect(dbTenantSetting?.deletedAt).toBeDefined()
      expect(dbTenantSetting?.deletedAt?.getTime()).toBeLessThanOrEqual(
        Date.now()
      )
    })

    test('cannot delete already deleted setting', async (): Promise<void> => {
      const createOptions: CreateOptions = {
        tenantId: tenant.id,
        setting: [exchangeRatesSetting()]
      }

      const tenantSetting = await tenantSettingService.create(createOptions)
      await tenantSettingService.delete({
        tenantId: tenantSetting[0].tenantId,
        key: createOptions.setting[0].key
      })

      let dbTenantSetting = await TenantSetting.query().findById(
        tenantSetting[0].id
      )
      expect(dbTenantSetting?.deletedAt).toBeDefined()

      const originalDeletedAt = dbTenantSetting?.deletedAt
      await tenantSettingService.delete({
        tenantId: tenantSetting[0].tenantId,
        key: createOptions.setting[0].key
      })

      dbTenantSetting = await TenantSetting.query().findById(
        tenantSetting[0].id
      )
      expect(dbTenantSetting?.deletedAt).toBeDefined()

      expect(originalDeletedAt?.getTime()).toEqual(
        dbTenantSetting?.deletedAt?.getTime()
      )
    })

    test('can delete all tenant settings', async (): Promise<void> => {
      for (let i = 0; i < 10; i++) {
        const createOptions: CreateOptions = {
          tenantId: tenant.id,
          setting: [randomSetting()]
        }

        await tenantSettingService.create(createOptions)
      }

      await tenantSettingService.delete({ tenantId: tenant.id })

      const dbTenantData = await TenantSetting.query().where({
        tenantId: tenant.id
      })

      expect(dbTenantData.filter((x) => !x.deletedAt)).toHaveLength(0)
    })
  })

  describe('getTenantSettings', () => {
    let tenantSetting: TenantSetting[]

    beforeEach(async (): Promise<void> => {
      const createOptions: CreateOptions = {
        tenantId: tenant.id,
        setting: [exchangeRatesSetting()]
      }

      tenantSetting = await tenantSettingService.create(createOptions)
    })

    afterEach(async (): Promise<void> => {
      await tenantSettingService.delete({ tenantId: tenant.id })
    })

    test('should retrieve tenant settings by tenantId', async (): Promise<void> => {
      const result = await tenantSettingService.get({
        tenantId: tenant.id
      })

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            tenantId: tenant.id,
            key: tenantSetting[0].key,
            value: tenantSetting[0].value
          })
        ])
      )
    })

    test('should retrieve tenant settings by tenantId and key', async (): Promise<void> => {
      const result = await tenantSettingService.get({
        tenantId: tenant.id,
        key: tenantSetting[0].key
      })

      expect(result).toEqual([
        expect.objectContaining({
          tenantId: tenant.id,
          key: tenantSetting[0].key,
          value: tenantSetting[0].value
        })
      ])
    })

    test('should return an empty array if no settings match', async (): Promise<void> => {
      const result = await tenantSettingService.get({
        tenantId: tenant.id,
        key: 'nonexistent-key'
      })

      expect(result).toEqual([])
    })

    test('should not retrieve deleted tenant settings', async (): Promise<void> => {
      await tenantSettingService.delete({
        tenantId: tenant.id,
        key: tenantSetting[0].key
      })

      const result = await tenantSettingService.get({
        tenantId: tenant.id,
        key: tenantSetting[0].key
      })

      expect(result).toEqual([])
    })
  })

  describe('get settings by value', (): void => {
    test('can get settings by wallet address prefix setting', async (): Promise<void> => {
      const secondTenant = await createTenant(deps)
      const baseUrl = `https://${faker.internet.domainName()}/${uuid()}`
      const settings = (
        await Promise.all([
          tenantSettingService.create({
            tenantId: tenant.id,
            setting: [
              {
                key: TenantSettingKeys.WALLET_ADDRESS_URL.name,
                value: `${baseUrl}/${uuid()}`
              }
            ]
          }),
          tenantSettingService.create({
            tenantId: secondTenant.id,
            setting: [
              {
                key: TenantSettingKeys.WALLET_ADDRESS_URL.name,
                value: `${baseUrl}/${uuid()}`
              }
            ]
          })
        ])
      ).flat()

      const retrievedSettings =
        await tenantSettingService.getSettingsByPrefix(baseUrl)
      expect(retrievedSettings).toEqual(settings)
    })

    test('does not retrieve tenants if no wallet address prefix matches', async (): Promise<void> => {
      const secondTenant = await createTenant(deps)
      const baseUrl = `https://${faker.internet.domainName()}/${uuid()}`
      await Promise.all([
        tenantSettingService.create({
          tenantId: tenant.id,
          setting: [
            {
              key: TenantSettingKeys.WALLET_ADDRESS_URL.name,
              value: `${baseUrl}/${uuid()}`
            }
          ]
        }),
        tenantSettingService.create({
          tenantId: secondTenant.id,
          setting: [
            {
              key: TenantSettingKeys.WALLET_ADDRESS_URL.name,
              value: `${baseUrl}/${uuid()}`
            }
          ]
        })
      ])

      const retrievedSettings = await tenantSettingService.getSettingsByPrefix(
        faker.internet.url()
      )
      expect(retrievedSettings).toHaveLength(0)
    })
  })
})
