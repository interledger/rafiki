import { IocContract } from '@adonisjs/fold'

import { Merchant } from './model'
import { MerchantService } from './service'

import { createTestApp, TestContainer } from '../tests/app'
import { truncateTables } from '../tests/tableManager'
import { Config, IAppConfig } from '../config/app'

import { initIocContainer } from '../'
import { AppServices } from '../app'

describe('Merchant Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let merchantService: MerchantService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({
      ...Config
    })

    appContainer = await createTestApp(deps)
    merchantService = await deps.use('merchantService')
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('create', (): void => {
    test('creates a merchant', async (): Promise<void> => {
      const merchant = await merchantService.create('Test merchant')
      expect(merchant).toEqual({ id: merchant.id, name: 'Test merchant' })
    })
  })

  describe('delete', (): void => {
    test('soft deletes an existing merchant', async (): Promise<void> => {
      const created = await merchantService.create('Test merchant')

      const result = await merchantService.delete(created.id)
      expect(result).toBe(true)

      const deletedMerchant = await Merchant.query()
        .findById(created.id)
        .whereNotNull('deletedAt')
      expect(deletedMerchant).toBeDefined()
      expect(deletedMerchant?.deletedAt).toBeDefined()
    })

    test('returns false for already deleted merchant', async (): Promise<void> => {
      const created = await merchantService.create('Test merchant')

      await merchantService.delete(created.id)
      const secondDelete = await merchantService.delete(created.id)
      expect(secondDelete).toBe(false)
    })
  })
})
