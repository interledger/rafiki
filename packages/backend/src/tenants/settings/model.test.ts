import assert from 'assert'
import { IocContract } from '@adonisjs/fold'
import { TenantSetting, TenantSettingKeys, formatSettings } from './model'
import { AppServices } from '../../app'
import { createTestApp, TestContainer } from '../../tests/app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import { createTenant } from '../../tests/tenant'
import { faker } from '@faker-js/faker'

describe('TenantSetting Model', (): void => {
  describe('default', () => {
    test('can specify default settings', async (): Promise<void> => {
      expect(TenantSetting.default()).toEqual([
        { key: 'WEBHOOK_TIMEOUT', value: '2000' },
        { key: 'WEBHOOK_MAX_RETRY', value: '10' }
      ])
    })
  })

  describe('formatting', () => {
    let deps: IocContract<AppServices>
    let appContainer: TestContainer

    beforeAll(async (): Promise<void> => {
      deps = initIocContainer(Config)
      appContainer = await createTestApp(deps)
    })

    afterAll(async (): Promise<void> => {
      await truncateTables(appContainer.container)
      await appContainer.shutdown()
    })
    test('can format tenant settings', async (): Promise<void> => {
      const tenant = await createTenant(deps)
      const webhookUrlSetting = await TenantSetting.query().insertAndFetch({
        tenantId: tenant.id,
        key: TenantSettingKeys.WEBHOOK_URL.name,
        value: faker.internet.url()
      })

      const webhookMaxRetrySetting = await TenantSetting.query().findOne({
        tenantId: tenant.id,
        key: TenantSettingKeys.WEBHOOK_MAX_RETRY.name,
        value: '10'
      })
      assert.ok(webhookMaxRetrySetting)

      const webhookTimeoutSetting = await TenantSetting.query().findOne({
        tenantId: tenant.id,
        key: TenantSettingKeys.WEBHOOK_TIMEOUT.name
      })
      assert.ok(webhookTimeoutSetting)

      const exchangeRateSetting = await TenantSetting.query().insertAndFetch({
        tenantId: tenant.id,
        key: TenantSettingKeys.EXCHANGE_RATES_URL.name,
        value: faker.internet.url()
      })

      const formattedSettings = formatSettings([
        webhookUrlSetting,
        webhookMaxRetrySetting,
        webhookTimeoutSetting,
        exchangeRateSetting
      ])
      expect(formattedSettings).toMatchObject({
        exchangeRatesUrl: exchangeRateSetting.value,
        webhookUrl: webhookUrlSetting.value,
        webhookMaxRetry: webhookMaxRetrySetting.value,
        webhookTimeout: webhookTimeoutSetting.value
      })
    })
  })
})
