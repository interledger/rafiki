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
  CreatePaymentPointerKeyInput,
  CreatePaymentPointerKeyMutationResponse,
  RevokePaymentPointerKeyMutationResponse
} from '../generated/graphql'
import { PaymentPointerService } from '../../open_payments/payment_pointer/service'
import { randomAsset } from '../../tests/asset'
import { isPaymentPointerError } from '../../open_payments/payment_pointer/errors'
import { PaymentPointerKeyService } from '../../paymentPointerKey/service'

const TEST_KEY = {
  kid: uuid(),
  x: 'test-public-key',
  kty: 'OKP',
  alg: 'EdDSA',
  crv: 'Ed25519',
  key_ops: ['sign', 'verify'],
  use: 'sig'
}

describe('Payment Pointer Key Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let paymentPointerService: PaymentPointerService
  let paymentPointerKeyService: PaymentPointerKeyService

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    paymentPointerService = await deps.use('paymentPointerService')
    paymentPointerKeyService = await deps.use('paymentPointerKeyService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('Create Payment Pointer Keys', (): void => {
    test('Can create payment pointer key', async (): Promise<void> => {
      const paymentPointer = await paymentPointerService.create({
        url: 'https://alice.me/.well-known/pay',
        asset: randomAsset()
      })
      assert.ok(!isPaymentPointerError(paymentPointer))

      const input: CreatePaymentPointerKeyInput = {
        paymentPointerId: paymentPointer.id,
        jwk: JSON.stringify(TEST_KEY)
      }

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreatePaymentPointerKey(
              $input: CreatePaymentPointerKeyInput!
            ) {
              createPaymentPointerKey(input: $input) {
                code
                success
                message
                paymentPointerKey {
                  id
                  paymentPointerId
                  jwk
                  createdAt
                }
              }
            }
          `,
          variables: {
            input
          }
        })
        .then((query): CreatePaymentPointerKeyMutationResponse => {
          if (query.data) {
            return query.data.createPaymentPointerKey
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      assert.ok(response.paymentPointerKey)
      expect(response.paymentPointerKey).toMatchObject({
        __typename: 'PaymentPointerKey',
        paymentPointerId: input.paymentPointerId
      })
      expect(JSON.parse(input.jwk)).toEqual(TEST_KEY)
    })

    test('500', async (): Promise<void> => {
      jest
        .spyOn(paymentPointerKeyService, 'create')
        .mockImplementationOnce(async (_args) => {
          throw new Error('unexpected')
        })

      const paymentPointer = await paymentPointerService.create({
        url: 'https://alice.me/.well-known/pay',
        asset: randomAsset()
      })
      assert.ok(!isPaymentPointerError(paymentPointer))

      const input = {
        paymentPointerId: paymentPointer.id,
        jwk: JSON.stringify(TEST_KEY)
      }

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreatePaymentPointerKey(
              $input: CreatePaymentPointerKeyInput!
            ) {
              createPaymentPointerKey(input: $input) {
                code
                success
                message
                paymentPointerKey {
                  id
                  paymentPointerId
                  jwk
                  createdAt
                }
              }
            }
          `,
          variables: {
            input
          }
        })
        .then((query): CreatePaymentPointerKeyMutationResponse => {
          if (query.data) {
            return query.data.createPaymentPointerKey
          } else {
            throw new Error('Data was empty')
          }
        })
      expect(response.code).toBe('500')
      expect(response.success).toBe(false)
      expect(response.message).toBe(
        'Error trying to create payment pointer key'
      )
    })
  })

  describe('Revoke key', (): void => {
    test('Can revoke a key', async (): Promise<void> => {
      const paymentPointer = await paymentPointerService.create({
        url: 'https://alice.me/.well-known/pay',
        asset: randomAsset()
      })
      assert.ok(!isPaymentPointerError(paymentPointer))

      const key = await paymentPointerKeyService.create({
        paymentPointerId: paymentPointer.id,
        jwk: TEST_KEY
      })

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation revokePaymentPointerKey($keyId: String!) {
              revokePaymentPointerKey(keyId: $keyId) {
                code
                success
                message
                keyId
              }
            }
          `,
          variables: {
            keyId: key.id
          }
        })
        .then((query): RevokePaymentPointerKeyMutationResponse => {
          if (query.data) {
            return query.data.revokePaymentPointerKey
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(true)
      expect(response.code).toBe('200')
      expect(response.keyId).toBe(key.id)
    })
  })
})
