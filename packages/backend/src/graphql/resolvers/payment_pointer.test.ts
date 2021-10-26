import { gql } from 'apollo-server-koa'
import Knex from 'knex'
import { v4 as uuid } from 'uuid'
import { ApolloError } from '@apollo/client'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import { PaymentPointerService } from '../../payment_pointer/service'
import { randomAsset } from '../../tests/asset'
import {
  CreatePaymentPointerInput,
  CreatePaymentPointerMutationResponse,
  PaymentPointer
} from '../generated/graphql'

describe('Payment Pointer Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let paymentPointerService: PaymentPointerService

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      knex = await deps.use('knex')
      paymentPointerService = await deps.use('paymentPointerService')
    }
  )

  afterEach(
    async (): Promise<void> => {
      await truncateTables(knex)
    }
  )

  afterAll(
    async (): Promise<void> => {
      await appContainer.apolloClient.stop()
      await appContainer.shutdown()
    }
  )

  describe('Create Payment Pointer', (): void => {
    test('Can create a payment pointer', async (): Promise<void> => {
      const input: CreatePaymentPointerInput = {
        asset: randomAsset()
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreatePaymentPointer($input: CreatePaymentPointerInput!) {
              createPaymentPointer(input: $input) {
                code
                success
                message
                paymentPointer {
                  id
                  asset {
                    code
                    scale
                  }
                }
              }
            }
          `,
          variables: {
            input
          }
        })
        .then(
          (query): CreatePaymentPointerMutationResponse => {
            if (query.data) {
              return query.data.createPaymentPointer
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.paymentPointer).toEqual({
        __typename: 'PaymentPointer',
        id: response.paymentPointer.id,
        asset: {
          __typename: 'Asset',
          code: input.asset.code,
          scale: input.asset.scale
        }
      })
      await expect(
        paymentPointerService.get(response.paymentPointer.id)
      ).resolves.toMatchObject({
        id: response.paymentPointer.id,
        asset: {
          code: input.asset.code,
          scale: input.asset.scale
        }
      })
    })
  })

  describe('Payment Pointer Queries', (): void => {
    test('Can get a payment pointer', async (): Promise<void> => {
      const asset = randomAsset()
      const paymentPointer = await paymentPointerService.create({ asset })
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query PaymentPointer($paymentPointerId: String!) {
              paymentPointer(id: $paymentPointerId) {
                id
                asset {
                  code
                  scale
                }
              }
            }
          `,
          variables: {
            paymentPointerId: paymentPointer.id
          }
        })
        .then(
          (query): PaymentPointer => {
            if (query.data) {
              return query.data.paymentPointer
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(query).toEqual({
        __typename: 'PaymentPointer',
        id: paymentPointer.id,
        asset: {
          __typename: 'Asset',
          code: paymentPointer.asset.code,
          scale: paymentPointer.asset.scale
        }
      })
    })

    test('Returns error for unknown payment pointer', async (): Promise<void> => {
      const gqlQuery = appContainer.apolloClient
        .query({
          query: gql`
            query PaymentPointer($paymentPointerId: String!) {
              paymentPointer(id: $paymentPointerId) {
                id
              }
            }
          `,
          variables: {
            paymentPointerId: uuid()
          }
        })
        .then(
          (query): PaymentPointer => {
            if (query.data) {
              return query.data.paymentPointer
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      await expect(gqlQuery).rejects.toThrow(ApolloError)
    })
  })
})
