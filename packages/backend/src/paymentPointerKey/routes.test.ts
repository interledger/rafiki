import { createPublicKey } from 'crypto'
import jestOpenAPI from 'jest-openapi'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { createContext } from '../tests/context'
import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '..'
import { AppServices, PaymentPointerContext } from '../app'
import { truncateTables } from '../tests/tableManager'
import { PaymentPointerKeyRoutes } from './routes'
import { PaymentPointerKeyService } from './service'
import { createPaymentPointer } from '../tests/paymentPointer'

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
  let paymentPointerKeyService: PaymentPointerKeyService
  let paymentPointerKeyRoutes: PaymentPointerKeyRoutes
  const mockMessageProducer = {
    send: jest.fn()
  }

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    deps.bind('messageProducer', async () => mockMessageProducer)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    jestOpenAPI(await deps.use('openApi'))
    paymentPointerKeyService = await deps.use('paymentPointerKeyService')
  })

  beforeEach(async (): Promise<void> => {
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
      const paymentPointer = await createPaymentPointer(deps)

      const keyOption = {
        paymentPointerId: paymentPointer.id,
        jwk: TEST_KEY
      }
      const key = await paymentPointerKeyService.create(keyOption)

      const ctx = createContext<PaymentPointerContext>({
        headers: { Accept: 'application/json' },
        url: `/jwks.json`
      })
      ctx.paymentPointer = paymentPointer
      ctx.paymentPointerUrl = paymentPointer.url

      await expect(
        paymentPointerKeyRoutes.getKeysByPaymentPointerId(ctx)
      ).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.body).toEqual({
        keys: [key.jwk]
      })
    })

    test('returns 200 with empty array if no keys for a payment pointer', async (): Promise<void> => {
      const paymentPointer = await createPaymentPointer(deps)

      const ctx = createContext<PaymentPointerContext>({
        headers: { Accept: 'application/json' },
        url: `/jwks.json`
      })
      ctx.paymentPointer = paymentPointer
      ctx.paymentPointerUrl = paymentPointer.url

      await expect(
        paymentPointerKeyRoutes.getKeysByPaymentPointerId(ctx)
      ).resolves.toBeUndefined()
      expect(ctx.body).toEqual({
        keys: []
      })
    })

    test('returns 200 with backend key', async (): Promise<void> => {
      const config = await deps.use('config')
      const jwk = {
        ...createPublicKey(config.privateKey).export({ format: 'jwk' }),
        kid: config.keyId,
        alg: 'EdDSA'
      }

      const ctx = createContext<PaymentPointerContext>({
        headers: { Accept: 'application/json' },
        url: '/jwks.json'
      })
      ctx.paymentPointerUrl = config.paymentPointerUrl

      await expect(
        paymentPointerKeyRoutes.getKeysByPaymentPointerId(ctx)
      ).resolves.toBeUndefined()
      expect(ctx.body).toEqual({
        keys: [jwk]
      })
    })

    test('returns 404 if payment pointer does not exist', async (): Promise<void> => {
      const ctx = createContext<PaymentPointerContext>({
        headers: { Accept: 'application/json' },
        url: `/jwks.json`
      })
      ctx.paymentPointer = undefined

      await expect(
        paymentPointerKeyRoutes.getKeysByPaymentPointerId(ctx)
      ).rejects.toHaveProperty('status', 404)
    })
  })
})
