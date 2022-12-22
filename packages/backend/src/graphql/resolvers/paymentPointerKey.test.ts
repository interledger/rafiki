import assert from 'assert'
import { gql } from 'apollo-server-koa'
import { Knex } from 'knex'
import { generateJwk } from 'http-signature-utils'
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
  RevokePaymentPointerKeyMutationResponse,
  JwkInput
} from '../generated/graphql'
import { PaymentPointerKeyService } from '../../open_payments/payment_pointer/key/service'
import { createPaymentPointer } from '../../tests/paymentPointer'

const TEST_KEY = generateJwk({ keyId: uuid() })

describe('Payment Pointer Key Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let paymentPointerKeyService: PaymentPointerKeyService

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = appContainer.knex
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
      const paymentPointer = await createPaymentPointer(deps)

      const input: CreatePaymentPointerKeyInput = {
        paymentPointerId: paymentPointer.id,
        jwk: TEST_KEY as JwkInput
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
                  jwk {
                    kid
                    x
                    alg
                    kty
                    crv
                  }
                  revoked
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
        paymentPointerId: input.paymentPointerId,
        jwk: {
          __typename: 'Jwk',
          ...TEST_KEY
        },
        revoked: false
      })
    })

    test('500', async (): Promise<void> => {
      jest
        .spyOn(paymentPointerKeyService, 'create')
        .mockImplementationOnce(async (_args) => {
          throw new Error('unexpected')
        })

      const paymentPointer = await createPaymentPointer(deps)

      const input = {
        paymentPointerId: paymentPointer.id,
        jwk: TEST_KEY
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
                  jwk {
                    kid
                    x
                    alg
                    kty
                    crv
                  }
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
      const paymentPointer = await createPaymentPointer(deps)

      const key = await paymentPointerKeyService.create({
        paymentPointerId: paymentPointer.id,
        jwk: TEST_KEY
      })

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation revokePaymentPointerKey($id: String!) {
              revokePaymentPointerKey(id: $id) {
                code
                success
                message
                paymentPointerKey {
                  id
                  paymentPointerId
                  jwk {
                    kid
                    x
                    alg
                    kty
                    crv
                  }
                  revoked
                }
              }
            }
          `,
          variables: {
            id: key.id
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
      assert.ok(response.paymentPointerKey)
      expect(response.paymentPointerKey).toMatchObject({
        __typename: 'PaymentPointerKey',
        id: key.id,
        paymentPointerId: key.paymentPointerId,
        jwk: {
          ...key.jwk,
          __typename: 'Jwk'
        },
        revoked: true
      })
    })

    test('Returns 404 if key does not exist', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation revokePaymentPointerKey($id: String!) {
              revokePaymentPointerKey(id: $id) {
                code
                success
                message
                paymentPointerKey {
                  id
                  paymentPointerId
                }
              }
            }
          `,
          variables: {
            id: uuid()
          }
        })
        .then((query): RevokePaymentPointerKeyMutationResponse => {
          if (query.data) {
            return query.data.revokePaymentPointerKey
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(false)
      expect(response.code).toBe('404')
      expect(response.message).toBe('Payment pointer key not found')
      expect(response.paymentPointerKey).toBeNull()
    })
  })
})
