import jestOpenAPI from 'jest-openapi'
import { IocContract } from '@adonisjs/fold'
import { faker } from '@faker-js/faker'
import { initIocContainer } from '../../'
import { AppServices, PaymentPointerContext } from '../../app'
import { Config, IAppConfig } from '../../config/app'
import { createTestApp, TestContainer } from '../../tests/app'
import { createContext } from '../../tests/context'
import { createPaymentPointer } from '../../tests/paymentPointer'
import { truncateTables } from '../../tests/tableManager'
import { PaymentPointerRoutes } from './routes'

describe('Payment Pointer Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let config: IAppConfig
  let paymentPointerRoutes: PaymentPointerRoutes

  beforeAll(async (): Promise<void> => {
    config = Config
    config.authServerGrantUrl = 'https://auth.wallet.example/authorize'
    deps = await initIocContainer(config)
    appContainer = await createTestApp(deps)
    const { resourceServerSpec } = await deps.use('openApi')
    jestOpenAPI(resourceServerSpec)
  })

  beforeEach(async (): Promise<void> => {
    config = await deps.use('config')
    paymentPointerRoutes = await deps.use('paymentPointerRoutes')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get', (): void => {
    test('returns 404 for nonexistent payment pointer', async (): Promise<void> => {
      const ctx = createContext<PaymentPointerContext>({
        headers: { Accept: 'application/json' }
      })
      await expect(paymentPointerRoutes.get(ctx)).rejects.toHaveProperty(
        'status',
        404
      )
    })

    test('returns 200 with an open payments payment pointer', async (): Promise<void> => {
      const paymentPointer = await createPaymentPointer(deps, {
        publicName: faker.name.firstName()
      })

      const ctx = createContext<PaymentPointerContext>({
        headers: { Accept: 'application/json' },
        url: '/'
      })
      ctx.paymentPointer = paymentPointer
      await expect(paymentPointerRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.body).toEqual({
        id: paymentPointer.url,
        publicName: paymentPointer.publicName,
        assetCode: paymentPointer.asset.code,
        assetScale: paymentPointer.asset.scale,
        authServer: 'https://auth.wallet.example/authorize'
      })
    })
  })
})
