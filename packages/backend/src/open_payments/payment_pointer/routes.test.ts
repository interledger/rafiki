import jestOpenAPI from 'jest-openapi'
import { Knex } from 'knex'

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
import { ClientService } from '../../clients/service'

const TEST_CLIENT = {
  name: faker.name.firstName(),
  uri: faker.internet.url(),
  email: faker.internet.exampleEmail(),
  image: faker.image.avatar()
}

describe('Payment Pointer Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let config: IAppConfig
  let paymentPointerRoutes: PaymentPointerRoutes
  let clientService: ClientService

  beforeAll(async (): Promise<void> => {
    config = Config
    config.authServerGrantUrl = 'https://auth.wallet.example/authorize'
    deps = await initIocContainer(config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    jestOpenAPI(await deps.use('openApi'))
  })

  beforeEach(async (): Promise<void> => {
    config = await deps.use('config')
    paymentPointerRoutes = await deps.use('paymentPointerRoutes')
    clientService = await deps.use('clientService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
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

  describe('getKeys', (): void => {
    test('returns 200 with key set', async (): Promise<void> => {
      const paymentPointer = await createPaymentPointer(deps, {
        publicName: faker.name.firstName()
      })

      const ctx = createContext<PaymentPointerContext>({
        headers: { Accept: 'application/json' },
        url: '/'
      })

      ctx.paymentPointer = paymentPointer

      await clientService.createClient({
        paymentPointerUrl: paymentPointer.url,
        ...TEST_CLIENT
      })

      await expect(paymentPointerRoutes.getKeys(ctx)).resolves.toBeUndefined()
    })

    test('returns 404 for nonexistent client', async (): Promise<void> => {
      const paymentPointer = await createPaymentPointer(deps, {
        publicName: faker.name.firstName()
      })

      const ctx = createContext<PaymentPointerContext>({
        headers: { Accept: 'application/json' },
        url: '/'
      })

      ctx.paymentPointer = paymentPointer

      await expect(paymentPointerRoutes.getKeys(ctx)).rejects.toHaveProperty(
        'status',
        404
      )
    })
  })
})
