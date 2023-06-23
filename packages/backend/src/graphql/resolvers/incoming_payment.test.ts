import { gql } from '@apollo/client'
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
  IncomingPayment as IncomingPaymentModel,
  IncomingPaymentState
} from '../../open_payments/payment/incoming/model'
import {
  IncomingPayment,
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
  let paymentPointerId: string
  let incomingPaymentService: IncomingPaymentService
  let asset: Asset

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    incomingPaymentService = await deps.use('incomingPaymentService')
    asset = await createAsset(deps)
  })

  afterAll(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
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
          externalRef: '#123',
          metadata: {
            description: `IncomingPayment`,
            externalRef: '#123'
          }
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
      metadata                                          | description  | externalRef  | expiresAt                        | withAmount | desc
      ${{ description: 'rent', externalRef: '202201' }} | ${undefined} | ${'202201'}  | ${undefined}                     | ${false}   | ${'metadata'}
      ${undefined}                                      | ${undefined} | ${undefined} | ${new Date(Date.now() + 30_000)} | ${false}   | ${'expiresAt'}
      ${undefined}                                      | ${undefined} | ${undefined} | ${undefined}                     | ${true}    | ${'incomingAmount'}
    `(
      '200 ($desc)',
      async ({
        description,
        externalRef,
        metadata,
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
          metadata,
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
          externalRef,
          metadata
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
                    metadata
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
            metadata: metadata || null,
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

  describe('Query.incomingPayment', (): void => {
    let payment: IncomingPaymentModel

    const createPayment = async (options: {
      paymentPointerId: string
      description?: string
      externalRef?: string
      metadata?: Record<string, unknown>
    }): Promise<IncomingPaymentModel> => {
      return await createIncomingPayment(deps, {
        ...options,
        incomingAmount: {
          value: BigInt(56),
          assetCode: asset.code,
          assetScale: asset.scale
        }
      })
    }

    describe('metadata', (): void => {
      const metadata = {
        description: 'rent',
        externalRef: '202201'
      }
      beforeEach(async (): Promise<void> => {
        const { id: paymentPointerId } = await createPaymentPointer(deps, {
          assetId: asset.id
        })
        payment = await createPayment({ paymentPointerId, metadata })
      })

      // Query with each payment state
      const states: IncomingPaymentState[] = Object.values(IncomingPaymentState)
      test.each(states)('200 - %s', async (state): Promise<void> => {
        const expiresAt = new Date()
        jest
          .spyOn(incomingPaymentService, 'get')
          .mockImplementation(async () => {
            const updatedPayment = payment
            updatedPayment.state = state
            updatedPayment.expiresAt = expiresAt
            return updatedPayment
          })

        const query = await appContainer.apolloClient
          .query({
            query: gql`
              query IncomingPayment($paymentId: String!) {
                incomingPayment(id: $paymentId) {
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
                  metadata
                  createdAt
                }
              }
            `,
            variables: {
              paymentId: payment.id
            }
          })
          .then((query): IncomingPayment => query.data?.incomingPayment)

        expect(query).toEqual({
          id: payment.id,
          paymentPointerId: payment.paymentPointerId,
          state,
          expiresAt: expiresAt.toISOString(),
          incomingAmount: {
            value: payment.incomingAmount?.value.toString(),
            assetCode: payment.incomingAmount?.assetCode,
            assetScale: payment.incomingAmount?.assetScale,
            __typename: 'Amount'
          },
          receivedAmount: {
            value: payment.receivedAmount.value.toString(),
            assetCode: payment.receivedAmount.assetCode,
            assetScale: payment.receivedAmount.assetScale,
            __typename: 'Amount'
          },
          metadata,
          createdAt: payment.createdAt.toISOString(),
          __typename: 'IncomingPayment'
        })
      })
    })

    test('404', async (): Promise<void> => {
      jest
        .spyOn(incomingPaymentService, 'get')
        .mockImplementation(async () => undefined)

      await expect(
        appContainer.apolloClient.query({
          query: gql`
            query IncomingPayment($paymentId: String!) {
              incomingPayment(id: $paymentId) {
                id
              }
            }
          `,
          variables: { paymentId: uuid() }
        })
      ).rejects.toThrow('payment does not exist')
    })
  })
})
