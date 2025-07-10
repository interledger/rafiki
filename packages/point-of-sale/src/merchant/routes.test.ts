import { IocContract } from '@adonisjs/fold'
import { v4 as uuid } from 'uuid'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { Config } from '../config/app'
import { createTestApp, TestContainer } from '../tests/app'
import { createContext } from '../tests/context'
import { truncateTables } from '../tests/tableManager'
import {
  CreateMerchantContext,
  createMerchantRoutes,
  DeleteMerchantContext,
  MerchantRoutes
} from './routes'
import { MerchantService } from './service'

describe('Merchant Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let merchantRoutes: MerchantRoutes
  let merchantService: MerchantService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    merchantService = await deps.use('merchantService')
    const logger = await deps.use('logger')

    merchantRoutes = createMerchantRoutes({
      merchantService,
      logger
    })
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('create', (): void => {
    test('Creates a merchant', async (): Promise<void> => {
      const merchantData = {
        name: 'Test Merchant'
      }

      const ctx = createContext<CreateMerchantContext>(
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          }
        },
        {}
      )
      ctx.request.body = merchantData

      await merchantRoutes.create(ctx)

      expect(ctx.status).toBe(200)
      expect(ctx.response.body).toEqual({
        id: expect.any(String),
        name: merchantData.name
      })
    })
  })

  describe('delete', (): void => {
    test('Deletes a merchant', async (): Promise<void> => {
      const merchant = await merchantService.create('Test Merchant')

      const ctx = createContext<DeleteMerchantContext>(
        {
          headers: {
            Accept: 'application/json'
          }
        },
        {}
      )
      ctx.request.params = { merchantId: merchant.id }

      await merchantRoutes.delete(ctx)

      expect(ctx.status).toBe(204)
    })

    test('Returns 404 for non-existent merchant', async (): Promise<void> => {
      const ctx = createContext<DeleteMerchantContext>(
        {
          headers: {
            Accept: 'application/json'
          }
        },
        {}
      )
      ctx.request.params = { merchantId: uuid() }

      await expect(merchantRoutes.delete(ctx)).rejects.toThrow(
        'Merchant not found'
      )
    })

    test('Returns 404 for already deleted merchant', async (): Promise<void> => {
      const merchant = await merchantService.create('Test Merchant')
      await merchantService.delete(merchant.id)

      const ctx = createContext<DeleteMerchantContext>(
        {
          headers: {
            Accept: 'application/json'
          }
        },
        {}
      )
      ctx.request.params = { merchantId: merchant.id }

      await expect(merchantRoutes.delete(ctx)).rejects.toThrow(
        'Merchant not found'
      )
    })
  })
})
