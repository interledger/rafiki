import jestOpenAPI from 'jest-openapi'
import assert from 'assert'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { createContext } from '../tests/context'
import { createTestApp, TestContainer } from '../tests/app'
import { Config, IAppConfig } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices, ClientKeysContext } from '../app'
import { truncateTables } from '../tests/tableManager'
import { ClientKeysRoutes } from './routes'
import {
  AddKeyToPaymentPointerOptions,
  PaymentPointerService
} from '../open_payments/payment_pointer/service'
import { randomAsset } from '../tests/asset'
import { isPaymentPointerError } from '../open_payments/payment_pointer/errors'

const KEY_REGISTRY_ORIGIN = 'https://openpayments.network'
const KEY_UUID = uuid()
const TEST_KID_PATH = '/keys/' + KEY_UUID
const TEST_CLIENT_KEY = {
  kid: KEY_REGISTRY_ORIGIN + TEST_KID_PATH,
  x: 'test-public-key',
  kty: 'OKP',
  alg: 'EdDSA',
  crv: 'Ed25519',
  key_ops: ['sign', 'verify'],
  use: 'sig'
}

describe('Client Keys Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let paymentPointerService: PaymentPointerService
  let config: IAppConfig
  let clientKeysRoutes: ClientKeysRoutes
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
    clientKeysRoutes = await deps.use('clientKeysRoutes')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get', (): void => {
    test('returns 404 for nonexistent key', async (): Promise<void> => {
      const ctx = createContext<ClientKeysContext>(
        {
          headers: { Accept: 'application/json' }
        },
        { keyId: uuid() }
      )
      await expect(clientKeysRoutes.get(ctx)).rejects.toHaveProperty(
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

      const keyOption: AddKeyToPaymentPointerOptions = {
        id: KEY_UUID,
        paymentPointerId: paymentPointer.id,
        jwk: TEST_CLIENT_KEY
      }
      await paymentPointerService.addKeyToPaymentPointer(keyOption)

      const ctx = createContext<ClientKeysContext>(
        {
          headers: { Accept: 'application/json' },
          url: `/keys/${KEY_UUID}`
        },
        { keyId: KEY_UUID }
      )

      await expect(clientKeysRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.body).toEqual({
        key: TEST_CLIENT_KEY,
        client: {
          id: paymentPointer.id,
          name: paymentPointer.publicName,
          uri: paymentPointer.url
        }
      })
    })
  })
})
