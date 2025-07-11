import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { Config } from '../config/app'
import { TestContainer, createTestApp } from '../tests/app'
import { PaymentRoutes, createPaymentRoutes } from './routes'
import { truncateTables } from '../tests/tableManager'

describe('Payment Routes', () => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let paymentRoutes: PaymentRoutes
  beforeAll(async () => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    paymentRoutes = createPaymentRoutes({
      logger: await deps.use('logger')
      // paymentService
    })
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('payment', () => {
    test('returns the payment details', () => {})
  })
})
