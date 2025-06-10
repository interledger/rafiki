import { IocContract } from '@adonisjs/fold'
import assert from 'assert'
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
import { isTenantSettingError, TenantSettingError } from './errors'
import { isTenantError } from '../errors'

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

    const tenantOrError = await tenantService.create({
      apiSecret: faker.string.uuid(),
      email: faker.internet.email(),
      idpConsentUrl: faker.internet.url(),
      idpSecret: faker.string.uuid()
    })
    assert(!isTenantError(tenantOrError))
    tenant = tenantOrError
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

    test.each`
      key
      ${TenantSettingKeys.EXCHANGE_RATES_URL.name}
      ${TenantSettingKeys.WEBHOOK_MAX_RETRY.name}
      ${TenantSettingKeys.WEBHOOK_TIMEOUT.name}
      ${TenantSettingKeys.WEBHOOK_URL.name}
      ${TenantSettingKeys.WALLET_ADDRESS_URL.name}
    `(
      'cannot use invalid setting value for $key',
      async ({ key }): Promise<void> => {
        const invalidSettingOption: CreateOptions = {
          tenantId: tenant.id,
          setting: [
            {
              key,
              value: 'invalid_value'
            }
          ]
        }

        await expect(
          tenantSettingService.create(invalidSettingOption)
        ).resolves.toEqual(TenantSettingError.InvalidSetting)
      }
    )

    test.each`
      key
      ${TenantSettingKeys.EXCHANGE_RATES_URL.name}
      ${TenantSettingKeys.WEBHOOK_URL.name}
      ${TenantSettingKeys.WALLET_ADDRESS_URL.name}
    `(
      'accepts URL string for $key tenant setting',
      async ({ key }): Promise<void> => {
        const url = faker.internet.url()
        const createOption: CreateOptions = {
          tenantId: tenant.id,
          setting: [
            {
              key,
              value: url
            }
          ]
        }

        const tenantSetting = await tenantSettingService.create(createOption)
        expect(tenantSetting).toEqual([
          expect.objectContaining({
            tenantId: tenant.id,
            key,
            value: url
          })
        ])
      }
    )

    test('cannot use invalid numeric values for positive tenant settings', async (): Promise<void> => {
      const infiniteOption: CreateOptions = {
        tenantId: tenant.id,
        setting: [
          {
            key: TenantSettingKeys.WEBHOOK_TIMEOUT.name,
            value: 'Infinity'
          }
        ]
      }

      await expect(
        tenantSettingService.create(infiniteOption)
      ).resolves.toEqual(TenantSettingError.InvalidSetting)

      const zeroOption: CreateOptions = {
        tenantId: tenant.id,
        setting: [
          {
            key: TenantSettingKeys.WEBHOOK_TIMEOUT.name,
            value: '0'
          }
        ]
      }

      await expect(tenantSettingService.create(zeroOption)).resolves.toEqual(
        TenantSettingError.InvalidSetting
      )
    })

    test('cannot use invalid numeric values for non-negative numeric tenant settings', async (): Promise<void> => {
      const infiniteOption: CreateOptions = {
        tenantId: tenant.id,
        setting: [
          {
            key: TenantSettingKeys.WEBHOOK_MAX_RETRY.name,
            value: 'Infinity'
          }
        ]
      }

      await expect(
        tenantSettingService.create(infiniteOption)
      ).resolves.toEqual(TenantSettingError.InvalidSetting)

      const negativeOption: CreateOptions = {
        tenantId: tenant.id,
        setting: [
          {
            key: TenantSettingKeys.WEBHOOK_MAX_RETRY.name,
            value: '-1'
          }
        ]
      }

      await expect(
        tenantSettingService.create(negativeOption)
      ).resolves.toEqual(TenantSettingError.InvalidSetting)
    })

    test('accepts valid ILP address for ILP address tenant setting', async (): Promise<void> => {
      const invalidIlpAddressSetting: CreateOptions = {
        tenantId: tenant.id,
        setting: [
          {
            key: TenantSettingKeys.ILP_ADDRESS.name,
            value: 'test.net'
          }
        ]
      }

      await expect(
        tenantSettingService.create(invalidIlpAddressSetting)
      ).resolves.toEqual([
        expect.objectContaining({
          tenantId: tenant.id,
          key: TenantSettingKeys.ILP_ADDRESS.name,
          value: 'test.net'
        })
      ])
    })

    test('cannot use invalid ILP address for ILP address tenant setting', async (): Promise<void> => {
      const invalidIlpAddressSetting: CreateOptions = {
        tenantId: tenant.id,
        setting: [
          {
            key: TenantSettingKeys.ILP_ADDRESS.name,
            value: 'test'
          }
        ]
      }

      await expect(
        tenantSettingService.create(invalidIlpAddressSetting)
      ).resolves.toEqual(TenantSettingError.InvalidSetting)
    })
  })

  describe('get', () => {
    let tenantSetting: TenantSetting[]

    async function createTenantSetting(): Promise<TenantSetting[]> {
      const options: CreateOptions = {
        tenantId: tenant.id,
        setting: [randomSetting()]
      }

      const createdTenantSetting = await tenantSettingService.create(options)
      assert(!isTenantSettingError(createdTenantSetting))
      return createdTenantSetting
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
        value: faker.internet.url()
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

    test.each`
      key
      ${TenantSettingKeys.EXCHANGE_RATES_URL.name}
      ${TenantSettingKeys.WEBHOOK_MAX_RETRY.name}
      ${TenantSettingKeys.WEBHOOK_TIMEOUT.name}
      ${TenantSettingKeys.WEBHOOK_URL.name}
      ${TenantSettingKeys.WALLET_ADDRESS_URL.name}
    `(
      'cannot use invalid setting value for $key',
      async ({ key }): Promise<void> => {
        const invalidSettingOption: UpdateOptions = {
          tenantId: tenant.id,
          key,
          value: 'invalid_value'
        }

        await expect(
          tenantSettingService.update(invalidSettingOption)
        ).resolves.toEqual(TenantSettingError.InvalidSetting)
      }
    )

    test.each`
      key
      ${TenantSettingKeys.EXCHANGE_RATES_URL.name}
      ${TenantSettingKeys.WEBHOOK_URL.name}
      ${TenantSettingKeys.WALLET_ADDRESS_URL.name}
    `(
      'accepts URL string for $key tenant setting',
      async ({ key }): Promise<void> => {
        const createOption: CreateOptions = {
          tenantId: tenant.id,
          setting: [
            {
              key,
              value: faker.internet.url()
            }
          ]
        }
        await tenantSettingService.create(createOption)

        const url = faker.internet.url()
        const updateOption: UpdateOptions = {
          tenantId: tenant.id,
          key,
          value: url
        }

        const updatedTenantSetting =
          await tenantSettingService.update(updateOption)
        expect(updatedTenantSetting).toEqual([
          expect.objectContaining({
            tenantId: tenant.id,
            key,
            value: url
          })
        ])
      }
    )

    test('cannot use invalid numeric values for positive numeric tenant settings', async (): Promise<void> => {
      const createOption: CreateOptions = {
        tenantId: tenant.id,
        setting: [
          {
            key: TenantSettingKeys.WEBHOOK_TIMEOUT.name,
            value: '5000'
          }
        ]
      }
      await tenantSettingService.create(createOption)
      const infiniteOption: UpdateOptions = {
        tenantId: tenant.id,
        key: TenantSettingKeys.WEBHOOK_TIMEOUT.name,
        value: 'Infinity'
      }

      await expect(
        tenantSettingService.update(infiniteOption)
      ).resolves.toEqual(TenantSettingError.InvalidSetting)

      const zeroOption: UpdateOptions = {
        tenantId: tenant.id,
        key: TenantSettingKeys.WEBHOOK_TIMEOUT.name,
        value: '0'
      }

      await expect(tenantSettingService.update(zeroOption)).resolves.toEqual(
        TenantSettingError.InvalidSetting
      )
    })

    test('cannot use invalid numeric values for non-negative numeric tenant settings', async (): Promise<void> => {
      const createOption: CreateOptions = {
        tenantId: tenant.id,
        setting: [
          {
            key: TenantSettingKeys.WEBHOOK_MAX_RETRY.name,
            value: '10'
          }
        ]
      }

      await tenantSettingService.create(createOption)

      const infiniteOption: UpdateOptions = {
        tenantId: tenant.id,
        key: TenantSettingKeys.WEBHOOK_MAX_RETRY.name,
        value: 'Infinity'
      }

      await expect(
        tenantSettingService.update(infiniteOption)
      ).resolves.toEqual(TenantSettingError.InvalidSetting)

      const negativeOption: UpdateOptions = {
        tenantId: tenant.id,
        key: TenantSettingKeys.WEBHOOK_MAX_RETRY.name,
        value: '-1'
      }

      await expect(
        tenantSettingService.update(negativeOption)
      ).resolves.toEqual(TenantSettingError.InvalidSetting)
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

      const tenantSettingsOrError =
        await tenantSettingService.create(createOptions)
      assert(!isTenantSettingError(tenantSettingsOrError))
      await tenantSettingService.delete({
        tenantId: tenantSettingsOrError[0].tenantId,
        key: createOptions.setting[0].key
      })

      const dbTenantSetting = await TenantSetting.query().findById(
        tenantSettingsOrError[0].id
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
      assert(!isTenantSettingError(tenantSetting))
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

      const createdTenantSetting =
        await tenantSettingService.create(createOptions)
      assert(!isTenantSettingError(createdTenantSetting))
      tenantSetting = createdTenantSetting
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
