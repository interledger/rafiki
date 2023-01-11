import { Knex } from 'knex'
import { gql } from 'apollo-server-koa'

import { getPageTests } from './page.test'
import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Asset } from '../../asset/model'
import { Config } from '../../config/app'
import { createAsset } from '../../tests/asset'
import { createIncomingPayment } from '../../tests/incomingPayment'
import { createPaymentPointer } from '../../tests/paymentPointer'
import { truncateTables } from '../../tests/tableManager'
import { v4 as uuid } from 'uuid'
import { IncomingPaymentService } from '../../open_payments/payment/incoming/service'
import {
  IncomingPaymentResponse,
  IncomingPaymentState as SchemaPaymentState
} from '../generated/graphql'
import {
  IncomingPaymentError,
  errorToMessage
} from '../../open_payments/payment/incoming/errors'
import { Amount, serializeAmount } from '../../open_payments/amount'

describe('Incoming Payment Resolver', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let paymentPointerId: string
  let incomingPaymentService: IncomingPaymentService
  let asset: Asset

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    incomingPaymentService = await deps.use('incomingPaymentService')
    asset = await createAsset(deps)
  })

  afterAll(async (): Promise<void> => {
    await truncateTables(knex)
    await appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('Payment pointer incoming payments', (): void => {
    beforeEach(async (): Promise<void> => {
      paymentPointerId = (
        await createPaymentPointer(deps, { assetId: asset.id })
      ).id
    })

    getPageTests({
      getClient: () => appContainer.apolloClient,
      createModel: () =>
        createIncomingPayment(deps, {
          paymentPointerId,
          incomingAmount: {
            value: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          description: `IncomingPayment`,
          externalRef: '#123'
        }),
      pagedQuery: 'incomingPayments',
      parent: {
        query: 'paymentPointer',
        getId: () => paymentPointerId
      }
    })
  })

  describe('Mutation.createIncomingPayment', (): void => {
    let amount: Amount

    beforeEach((): void => {
      amount = {
        value: BigInt(56),
        assetCode: asset.code,
        assetScale: asset.scale
      }
    })

    test.each`
      description  | externalRef  | expiresAt                        | withAmount | desc
      ${'rent'}    | ${undefined} | ${undefined}                     | ${false}   | ${'description'}
      ${undefined} | ${'202201'}  | ${undefined}                     | ${false}   | ${'externalRef'}
      ${undefined} | ${undefined} | ${new Date(Date.now() + 30_000)} | ${false}   | ${'expiresAt'}
      ${undefined} | ${undefined} | ${undefined}                     | ${true}    | ${'incomingAmount'}
    `(
      '200 ($desc)',
      async ({
        description,
        externalRef,
        expiresAt,
        withAmount
      }): Promise<void> => {
        const incomingAmount = withAmount ? amount : undefined
        const { id: paymentPointerId } = await createPaymentPointer(deps, {
          assetId: asset.id
        })
        const payment = await createIncomingPayment(deps, {
          paymentPointerId,
          description,
          externalRef,
          expiresAt,
          incomingAmount
        })

        const createSpy = jest
          .spyOn(incomingPaymentService, 'create')
          .mockResolvedValueOnce(payment)

        const input = {
          paymentPointerId,
          incomingAmount,
          expiresAt,
          description,
          externalRef
        }

        const query = await appContainer.apolloClient
          .query({
            query: gql`
              mutation CreateIncomingPayment(
                $input: CreateIncomingPaymentInput!
              ) {
                createIncomingPayment(input: $input) {
                  code
                  success
                  message
                  payment {
                    id
                    paymentPointerId
                    state
                    expiresAt
                    incomingAmount {
                      value
                      assetCode
                      assetScale
                    }
                    receivedAmount {
                      value
                      assetCode
                      assetScale
                    }
                    description
                    externalRef
                    createdAt
                  }
                }
              }
            `,
            variables: { input }
          })
          .then(
            (query): IncomingPaymentResponse =>
              query.data?.createIncomingPayment
          )

        expect(createSpy).toHaveBeenCalledWith(input)
        expect(query).toEqual({
          __typename: 'IncomingPaymentResponse',
          code: '200',
          success: true,
          message: null,
          payment: {
            __typename: 'IncomingPayment',
            id: payment.id,
            paymentPointerId,
            state: SchemaPaymentState.Pending,
            expiresAt:
              expiresAt?.toISOString() || payment.expiresAt.toISOString(),
            incomingAmount:
              incomingAmount === undefined
                ? null
                : {
                    __typename: 'Amount',
                    ...serializeAmount(incomingAmount)
                  },
            receivedAmount: {
              __typename: 'Amount',
              ...serializeAmount(payment.receivedAmount)
            },
            description: description || null,
            externalRef: externalRef || null,
            createdAt: payment.createdAt.toISOString()
          }
        })
      }
    )

    test('400', async (): Promise<void> => {
      const createSpy = jest
        .spyOn(incomingPaymentService, 'create')
        .mockResolvedValueOnce(IncomingPaymentError.UnknownPaymentPointer)

      const input = {
        paymentPointerId: uuid()
      }

      const query = await appContainer.apolloClient
        .query({
          query: gql`
            mutation CreateIncomingPayment(
              $input: CreateIncomingPaymentInput!
            ) {
              createIncomingPayment(input: $input) {
                code
                success
                message
                payment {
                  id
                  state
                }
              }
            }
          `,
          variables: { input }
        })
        .then(
          (query): IncomingPaymentResponse => query.data?.createIncomingPayment
        )
      expect(query.code).toBe('404')
      expect(query.success).toBe(false)
      expect(query.message).toBe(
        errorToMessage[IncomingPaymentError.UnknownPaymentPointer]
      )
      expect(query.payment).toBeNull()
      expect(createSpy).toHaveBeenCalledWith(input)
    })

    test('500', async (): Promise<void> => {
      const createSpy = jest
        .spyOn(incomingPaymentService, 'create')
        .mockRejectedValueOnce(new Error('unexpected'))

      const input = {
        paymentPointerId: uuid()
      }

      const query = await appContainer.apolloClient
        .query({
          query: gql`
            mutation CreateIncomingPayment(
              $input: CreateIncomingPaymentInput!
            ) {
              createIncomingPayment(input: $input) {
                code
                success
                message
                payment {
                  id
                  state
                }
              }
            }
          `,
          variables: { input }
        })
        .then(
          (query): IncomingPaymentResponse => query.data?.createIncomingPayment
        )
      expect(createSpy).toHaveBeenCalledWith(input)
      expect(query.code).toBe('500')
      expect(query.success).toBe(false)
      expect(query.message).toBe('Error trying to create incoming payment')
      expect(query.payment).toBeNull()
    })
  })
})
