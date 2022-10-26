import jestOpenAPI from 'jest-openapi'
import assert from 'assert'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { createContext } from '../tests/context'
import { createTestApp, TestContainer } from '../tests/app'
import { Config, IAppConfig } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '..'
import { AppServices, PaymentPointerKeyContext } from '../app'
import { truncateTables } from '../tests/tableManager'
import { PaymentPointerKeyRoutes } from './routes'
import { PaymentPointerService } from '../open_payments/payment_pointer/service'
import { randomAsset } from '../tests/asset'
import { isPaymentPointerError } from '../open_payments/payment_pointer/errors'
import { PaymentPointerKeyService } from './service'

const TEST_KEY = {
  kid: uuid(),
  x: 'test-public-key',
  kty: 'OKP',
  alg: 'EdDSA',
  crv: 'Ed25519',
  key_ops: ['sign', 'verify'],
  use: 'sig'
}

describe('Payment Pointer Keys Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let paymentPointerService: PaymentPointerService
  let paymentPointerKeyService: PaymentPointerKeyService
  let config: IAppConfig
  let paymentPointerKeyRoutes: PaymentPointerKeyRoutes
  const mockMessageProducer = {
    send: jest.fn()
  }

  beforeAll(async (): Promise<void> => {
    config = Config
    deps = await initIocContainer(config)
    deps.bind('messageProducer', async () => mockMessageProducer)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    jestOpenAPI(await deps.use('openApi'))
  })

  beforeEach(async (): Promise<void> => {
    paymentPointerService = await deps.use('paymentPointerService')
    paymentPointerKeyService = await deps.use('paymentPointerKeyService')
    paymentPointerKeyRoutes = await deps.use('paymentPointerKeyRoutes')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get', (): void => {
    test('returns 404 for nonexistent key', async (): Promise<void> => {
      const ctx = createContext<PaymentPointerKeyContext>(
        {
          headers: { Accept: 'application/json' }
        },
        { keyId: uuid() }
      )
      await expect(paymentPointerKeyRoutes.get(ctx)).rejects.toHaveProperty(
        'status',
        404
      )
    })

    test('returns 200 with JWK set as body for valid key', async (): Promise<void> => {
      const paymentPointer = await paymentPointerService.create({
        url: 'https://alice.me/pay',
        asset: randomAsset()
      })
      assert.ok(!isPaymentPointerError(paymentPointer))

      const keyOption = {
        paymentPointerId: paymentPointer.id,
        jwk: TEST_KEY
      }
      const key = await paymentPointerKeyService.create(keyOption)

      const ctx = createContext<PaymentPointerKeyContext>(
        {
          headers: { Accept: 'application/json' },
          url: `/keys/${key.id}`
        },
        { keyId: key.id }
      )

      await expect(paymentPointerKeyRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.body).toEqual({
        key: TEST_KEY,
        paymentPointer: {
          id: paymentPointer.id,
          name: paymentPointer.publicName,
          uri: paymentPointer.url
        }
      })
    })
  })
})
