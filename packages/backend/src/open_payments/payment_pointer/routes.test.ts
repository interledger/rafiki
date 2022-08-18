import jestOpenAPI from 'jest-openapi'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { createContext } from '../../tests/context'
import { createTestApp, TestContainer } from '../../tests/app'
import { Config, IAppConfig } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../'
import { AppServices, PaymentPointerContext } from '../../app'
import { truncateTables } from '../../tests/tableManager'
import { createPaymentPointer } from '../../tests/paymentPointer'
import { PaymentPointerRoutes } from './routes'
import { faker } from '@faker-js/faker'

describe('Payment Pointer Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let config: IAppConfig
  let paymentPointerRoutes: PaymentPointerRoutes

  beforeAll(async (): Promise<void> => {
    config = Config
    config.publicHost = 'https://wallet.example'
    config.authServerGrantUrl = 'https://auth.wallet.example/authorize'
    deps = await initIocContainer(config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    jestOpenAPI(await deps.use('openApi'))
  })

  beforeEach(async (): Promise<void> => {
    config = await deps.use('config')
    paymentPointerRoutes = await deps.use('paymentPointerRoutes')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get', (): void => {
    test('returns 404 for nonexistent payment pointer', async (): Promise<void> => {
      const ctx = createContext<PaymentPointerContext>(
        {
          headers: { Accept: 'application/json' }
        },
        { paymentPointerId: uuid() }
      )
      await expect(paymentPointerRoutes.get(ctx)).rejects.toHaveProperty(
        'status',
        404
      )
    })

    test('returns 200 with an open payments payment pointer', async (): Promise<void> => {
      const paymentPointer = await createPaymentPointer(deps, {
        publicName: faker.name.firstName()
      })

      const ctx = createContext<PaymentPointerContext>(
        {
          headers: { Accept: 'application/json' },
          url: `/${paymentPointer.id}`
        },
        { paymentPointerId: paymentPointer.id }
      )
      await expect(paymentPointerRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.body).toEqual({
        // id: paymentPointer.url,
        id: `https://wallet.example/${paymentPointer.id}`,
        publicName: paymentPointer.publicName,
        assetCode: paymentPointer.asset.code,
        assetScale: paymentPointer.asset.scale,
        authServer: 'https://auth.wallet.example/authorize'
      })
    })
  })
})
