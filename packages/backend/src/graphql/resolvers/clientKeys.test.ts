import assert from 'assert'
import { gql } from 'apollo-server-koa'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import {
  AddKeyToClientInput,
  AddKeyToClientMutationResponse,
  RevokeClientKeyMutationResponse
} from '../generated/graphql'
import { PaymentPointerService } from '../../open_payments/payment_pointer/service'
import { randomAsset } from '../../tests/asset'
import { isPaymentPointerError } from '../../open_payments/payment_pointer/errors'

const KEY_REGISTRY_ORIGIN = 'https://openpayments.network'
const KEY_UUID = uuid()
const TEST_KID_PATH = '/keys/' + KEY_UUID
const TEST_KEY = {
  kid: KEY_REGISTRY_ORIGIN + TEST_KID_PATH,
  x: 'test-public-key',
  kty: 'OKP',
  alg: 'EdDSA',
  crv: 'Ed25519',
  key_ops: ['sign', 'verify'],
  use: 'sig'
}

describe('Client Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let paymentPointerService: PaymentPointerService

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    paymentPointerService = await deps.use('paymentPointerService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('Add Client Keys', (): void => {
    test('Can add keys to a payment pointer', async (): Promise<void> => {
      const paymentPointer = await paymentPointerService.create({
        url: 'https://alice.me/.well-known/pay',
        asset: randomAsset()
      })
      assert.ok(!isPaymentPointerError(paymentPointer))

      const input: AddKeyToClientInput = {
        id: KEY_UUID,
        paymentPointerId: paymentPointer.id,
        jwk: JSON.stringify(TEST_KEY)
      }

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation AddKeyToClient($input: AddKeyToClientInput!) {
              addKeyToClient(input: $input) {
                code
                success
                message
                paymentPointer {
                  id
                  keys {
                    id
                  }
                }
              }
            }
          `,
          variables: {
            input
          }
        })
        .then((query): AddKeyToClientMutationResponse => {
          if (query.data) {
            return query.data.addKeyToClient
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      assert(response.paymentPointer)

      expect(response.paymentPointer).toEqual({
        __typename: 'PaymentPointer',
        id: response.paymentPointer.id,
        keys: [
          {
            __typename: 'ClientKeys',
            id: KEY_UUID
          }
        ]
      })

      expect(response.paymentPointer.keys).toHaveLength(1)

      await expect(
        paymentPointerService.get(response.paymentPointer.id)
      ).resolves.toMatchObject({
        id: response.paymentPointer.id
      })
    })

    test('500', async (): Promise<void> => {
      jest
        .spyOn(paymentPointerService, 'addKeyToPaymentPointer')
        .mockImplementationOnce(async (_args) => {
          throw new Error('unexpected')
        })

      const paymentPointer = await paymentPointerService.create({
        url: 'https://alice.me/.well-known/pay',
        asset: randomAsset()
      })
      assert.ok(!isPaymentPointerError(paymentPointer))

      const input: AddKeyToClientInput = {
        id: KEY_UUID,
        paymentPointerId: paymentPointer.id,
        jwk: JSON.stringify(TEST_KEY)
      }

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation AddKeyToClient($input: AddKeyToClientInput!) {
              addKeyToClient(input: $input) {
                code
                success
                message
                paymentPointer {
                  id
                  keys {
                    id
                  }
                }
              }
            }
          `,
          variables: {
            input
          }
        })
        .then((query): AddKeyToClientMutationResponse => {
          if (query.data) {
            return query.data.addKeyToClient
          } else {
            throw new Error('Data was empty')
          }
        })
      expect(response.code).toBe('500')
      expect(response.success).toBe(false)
      expect(response.message).toBe('Error trying to add key to client')
    })
  })

  describe('Revoke key', (): void => {
    test('Can revoke a key', async (): Promise<void> => {
      const paymentPointer = await paymentPointerService.create({
        url: 'https://alice.me/.well-known/pay',
        asset: randomAsset()
      })
      assert.ok(!isPaymentPointerError(paymentPointer))

      await paymentPointerService.addKeyToPaymentPointer({
        id: KEY_UUID,
        paymentPointerId: paymentPointer.id,
        jwk: TEST_KEY
      })

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation revokeClientKey($keyId: String!) {
              revokeClientKey(keyId: $keyId) {
                code
                success
                message
                keyId
              }
            }
          `,
          variables: {
            keyId: KEY_UUID
          }
        })
        .then((query): RevokeClientKeyMutationResponse => {
          if (query.data) {
            return query.data.revokeClientKey
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(true)
      expect(response.code).toBe('200')
      expect(response.keyId).toBe(KEY_UUID)
    })
  })
})
