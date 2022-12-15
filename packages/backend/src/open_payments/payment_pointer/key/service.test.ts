import { Knex } from 'knex'
import { JWK } from 'open-payments'
import { v4 as uuid } from 'uuid'

import { PaymentPointerKeyService } from './service'
import { createTestApp, TestContainer } from '../../../tests/app'
import { truncateTables } from '../../../tests/tableManager'
import { Config } from '../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import { AppServices } from '../../../app'
import { createPaymentPointer } from '../../../tests/paymentPointer'

const TEST_KEY: JWK = {
  kid: uuid(),
  x: 'test-public-key',
  kty: 'OKP',
  alg: 'EdDSA',
  crv: 'Ed25519'
}

describe('Payment Pointer Key Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let paymentPointerKeyService: PaymentPointerKeyService
  let knex: Knex
  const mockMessageProducer = {
    send: jest.fn()
  }

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    deps.bind('messageProducer', async () => mockMessageProducer)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    paymentPointerKeyService = await deps.use('paymentPointerKeyService')
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('create', (): void => {
    test('adds a key to a payment pointer', async (): Promise<void> => {
      const paymentPointer = await createPaymentPointer(deps)

      const options = {
        paymentPointerId: paymentPointer.id,
        jwk: TEST_KEY
      }

      await expect(
        paymentPointerKeyService.create(options)
      ).resolves.toMatchObject(options)
    })
  })

  describe('Fetch Payment Pointer Keys', (): void => {
    test('Can fetch keys by payment pointer id', async (): Promise<void> => {
      const paymentPointer = await createPaymentPointer(deps)

      const keyOption = {
        paymentPointerId: paymentPointer.id,
        jwk: TEST_KEY
      }

      const key = await paymentPointerKeyService.create(keyOption)
      await expect(
        paymentPointerKeyService.getKeysByPaymentPointerId(paymentPointer.id)
      ).resolves.toEqual([key])
    })
  })

  describe('Revoke Payment Pointer Keys', (): void => {
    test('Can revoke a key', async (): Promise<void> => {
      const paymentPointer = await createPaymentPointer(deps)

      const keyOption = {
        paymentPointerId: paymentPointer.id,
        jwk: TEST_KEY
      }

      const key = await paymentPointerKeyService.create(keyOption)
      const revokedKey = await paymentPointerKeyService.revoke(key.id)
      expect(revokedKey).toEqual({
        ...key,
        revoked: true,
        updatedAt: revokedKey.updatedAt
      })
    })

    test('Returns undefined if key does not exist', async (): Promise<void> => {
      await expect(
        paymentPointerKeyService.revoke(uuid())
      ).resolves.toBeUndefined()
    })

    test('Returns key if key is already revoked', async (): Promise<void> => {
      const paymentPointer = await createPaymentPointer(deps)

      const keyOption = {
        paymentPointerId: paymentPointer.id,
        jwk: TEST_KEY
      }

      const key = await paymentPointerKeyService.create(keyOption)

      const revokedKey = await paymentPointerKeyService.revoke(key.id)
      await expect(paymentPointerKeyService.revoke(key.id)).resolves.toEqual(
        revokedKey
      )
    })
  })
})
