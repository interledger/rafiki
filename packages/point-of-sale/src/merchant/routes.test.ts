import { IocContract } from '@adonisjs/fold'
import { createContext } from '../tests/context'
import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'
import {
  CreateMerchantContext,
  MerchantRoutes,
  createMerchantRoutes
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
})
