import jestOpenAPI from 'jest-openapi'
import assert from 'assert'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { createContext } from '../tests/context'
import { createTestApp, TestContainer } from '../tests/app'
import { Config, IAppConfig } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '..'
import { AppServices, PaymentPointerContext } from '../app'
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

  describe('getKeys', (): void => {
    test('returns 200 with all keys for a payment pointer', async (): Promise<void> => {
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

      const ctx = createContext<PaymentPointerContext>({
        headers: { Accept: 'application/json' },
        url: `/`
      })
      ctx.paymentPointer = paymentPointer

      await expect(
        paymentPointerKeyRoutes.getKeysByPaymentPointerId(ctx)
      ).resolves.toBeUndefined()
      expect(ctx.body[0]).toEqual(key.jwk)
      expect(ctx.body).toHaveLength(1)
    })

    test('returns 200 with empty array if no keys for a payment pointer', async (): Promise<void> => {
      const paymentPointer = await paymentPointerService.create({
        url: 'https://alice.me/pay',
        asset: randomAsset()
      })
      assert.ok(!isPaymentPointerError(paymentPointer))

      const ctx = createContext<PaymentPointerContext>({
        headers: { Accept: 'application/json' },
        url: `/`
      })
      ctx.paymentPointer = paymentPointer

      await expect(
        paymentPointerKeyRoutes.getKeysByPaymentPointerId(ctx)
      ).resolves.toBeUndefined()
      expect(ctx.body).toEqual([])
    })

    test('returns 404 if payment pointer does not exist', async (): Promise<void> => {
      const ctx = createContext<PaymentPointerContext>({
        headers: { Accept: 'application/json' },
        url: `/`
      })
      ctx.paymentPointer = undefined

      await expect(
        paymentPointerKeyRoutes.getKeysByPaymentPointerId(ctx)
      ).rejects.toHaveProperty('status', 404)
    })
  })
})
