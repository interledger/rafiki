import { gql } from 'apollo-server-koa'
import { PaymentError } from '@interledger/pay'
import { v4 as uuid } from 'uuid'
import * as Pay from '@interledger/pay'

import { getPageTests } from './page.test'
import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { createAsset } from '../../tests/asset'
import { createOutgoingPayment } from '../../tests/outgoingPayment'
import { createPaymentPointer } from '../../tests/paymentPointer'
import { truncateTables } from '../../tests/tableManager'
import {
  OutgoingPaymentError,
  errorToMessage
} from '../../open_payments/payment/outgoing/errors'
import { OutgoingPaymentService } from '../../open_payments/payment/outgoing/service'
import {
  OutgoingPayment as OutgoingPaymentModel,
  OutgoingPaymentState
} from '../../open_payments/payment/outgoing/model'
import { AccountingService } from '../../accounting/service'
import { Asset } from '../../asset/model'
import {
  OutgoingPayment,
  OutgoingPaymentResponse,
  OutgoingPaymentState as SchemaPaymentState
} from '../generated/graphql'

describe('OutgoingPayment Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let accountingService: AccountingService
  let outgoingPaymentService: OutgoingPaymentService
  let asset: Asset

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    accountingService = await deps.use('accountingService')
    outgoingPaymentService = await deps.use('outgoingPaymentService')
  })

  beforeEach(async (): Promise<void> => {
    asset = await createAsset(deps)
  })

  afterEach(async (): Promise<void> => {
    jest.restoreAllMocks()
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  const createPayment = async (options: {
    paymentPointerId: string
    description?: string
    externalRef?: string
  }): Promise<OutgoingPaymentModel> => {
    return await createOutgoingPayment(deps, {
      ...options,
      receiver: `${Config.publicHost}/${uuid()}`,
      sendAmount: {
        value: BigInt(56),
        assetCode: asset.code,
        assetScale: asset.scale
      },
      validDestination: false
    })
  }

  describe('Query.outgoingPayment', (): void => {
    let payment: OutgoingPaymentModel

    describe.each`
      description  | externalRef  | desc
      ${'rent'}    | ${undefined} | ${'description'}
      ${undefined} | ${'202201'}  | ${'externalRef'}
    `('$desc', ({ description, externalRef }): void => {
      beforeEach(async (): Promise<void> => {
        const { id: paymentPointerId } = await createPaymentPointer(deps, {
          assetId: asset.id
        })
        payment = await createPayment({
          paymentPointerId,
          description,
          externalRef
        })
      })

      // Query with each payment state with and without an error
      const states: [OutgoingPaymentState, PaymentError | null][] =
        Object.values(OutgoingPaymentState).flatMap((state) => [
          [state, null],
          [state, Pay.PaymentError.ReceiverProtocolViolation]
        ])
      test.each(states)(
        '200 - %s, error: %s',
        async (state, error): Promise<void> => {
          const amountSent = BigInt(78)
          jest
            .spyOn(outgoingPaymentService, 'get')
            .mockImplementation(async () => {
              const updatedPayment = payment
              updatedPayment.state = state
              updatedPayment.error = error
              return updatedPayment
            })
          jest
            .spyOn(accountingService, 'getTotalSent')
            .mockImplementation(async (id: string) => {
              expect(id).toStrictEqual(payment.id)
              return amountSent
            })

          const query = await appContainer.apolloClient
            .query({
              query: gql`
                query OutgoingPayment($paymentId: String!) {
                  outgoingPayment(id: $paymentId) {
                    id
                    paymentPointerId
                    state
                    error
                    stateAttempts
                    receiver
                    sendAmount {
                      value
                      assetCode
                      assetScale
                    }
                    sentAmount {
                      value
                      assetCode
                      assetScale
                    }
                    receiveAmount {
                      value
                      assetCode
                      assetScale
                    }
                    description
                    externalRef
                    quote {
                      id
                      maxPacketAmount
                      minExchangeRate
                      lowEstimatedExchangeRate
                      highEstimatedExchangeRate
                      createdAt
                      expiresAt
                    }
                    createdAt
                  }
                }
              `,
              variables: {
                paymentId: payment.id
              }
            })
            .then((query): OutgoingPayment => query.data?.outgoingPayment)

          expect(query).toEqual({
            id: payment.id,
            paymentPointerId: payment.paymentPointerId,
            state,
            error,
            stateAttempts: 0,
            receiver: payment.receiver,
            sendAmount: {
              value: payment.sendAmount.value.toString(),
              assetCode: payment.sendAmount.assetCode,
              assetScale: payment.sendAmount.assetScale,
              __typename: 'Amount'
            },
            sentAmount: {
              value: payment.sentAmount.value.toString(),
              assetCode: payment.sentAmount.assetCode,
              assetScale: payment.sentAmount.assetScale,
              __typename: 'Amount'
            },
            receiveAmount: {
              value: payment.receiveAmount.value.toString(),
              assetCode: payment.receiveAmount.assetCode,
              assetScale: payment.receiveAmount.assetScale,
              __typename: 'Amount'
            },
            description: description ?? null,
            externalRef: externalRef ?? null,
            quote: {
              id: payment.quote.id,
              maxPacketAmount: payment.quote.maxPacketAmount.toString(),
              minExchangeRate: payment.quote.minExchangeRate.valueOf(),
              lowEstimatedExchangeRate:
                payment.quote.lowEstimatedExchangeRate.valueOf(),
              highEstimatedExchangeRate:
                payment.quote.highEstimatedExchangeRate.valueOf(),
              createdAt: payment.quote.createdAt.toISOString(),
              expiresAt: payment.quote.expiresAt.toISOString(),
              __typename: 'Quote'
            },
            createdAt: payment.createdAt.toISOString(),
            __typename: 'OutgoingPayment'
          })
        }
      )
    })

    test('404', async (): Promise<void> => {
      jest
        .spyOn(outgoingPaymentService, 'get')
        .mockImplementation(async () => undefined)

      await expect(
        appContainer.apolloClient.query({
          query: gql`
            query OutgoingPayment($paymentId: String!) {
              outgoingPayment(id: $paymentId) {
                id
              }
            }
          `,
          variables: { paymentId: uuid() }
        })
      ).rejects.toThrow('payment does not exist')
    })
  })

  describe('Mutation.createOutgoingPayment', (): void => {
    test.each`
      description  | externalRef  | desc
      ${'rent'}    | ${undefined} | ${'description'}
      ${undefined} | ${'202201'}  | ${'externalRef'}
    `('200 ($desc)', async ({ description, externalRef }): Promise<void> => {
      const { id: paymentPointerId } = await createPaymentPointer(deps, {
        assetId: asset.id
      })
      const payment = await createPayment({
        paymentPointerId,
        description,
        externalRef
      })

      const createSpy = jest
        .spyOn(outgoingPaymentService, 'create')
        .mockResolvedValueOnce(payment)

      const input = {
        paymentPointerId: payment.paymentPointerId,
        quoteId: payment.quote.id
      }

      const query = await appContainer.apolloClient
        .query({
          query: gql`
            mutation CreateOutgoingPayment(
              $input: CreateOutgoingPaymentInput!
            ) {
              createOutgoingPayment(input: $input) {
                code
                success
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
          (query): OutgoingPaymentResponse => query.data?.createOutgoingPayment
        )

      expect(createSpy).toHaveBeenCalledWith(input)
      expect(query.code).toBe('200')
      expect(query.success).toBe(true)
      expect(query.payment?.id).toBe(payment.id)
      expect(query.payment?.state).toBe(SchemaPaymentState.Funding)
    })

    test('400', async (): Promise<void> => {
      const createSpy = jest
        .spyOn(outgoingPaymentService, 'create')
        .mockResolvedValueOnce(OutgoingPaymentError.UnknownPaymentPointer)

      const input = {
        paymentPointerId: uuid(),
        quoteId: uuid()
      }

      const query = await appContainer.apolloClient
        .query({
          query: gql`
            mutation CreateOutgoingPayment(
              $input: CreateOutgoingPaymentInput!
            ) {
              createOutgoingPayment(input: $input) {
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
          (query): OutgoingPaymentResponse => query.data?.createOutgoingPayment
        )
      expect(query.code).toBe('404')
      expect(query.success).toBe(false)
      expect(query.message).toBe(
        errorToMessage[OutgoingPaymentError.UnknownPaymentPointer]
      )
      expect(query.payment).toBeNull()
      expect(createSpy).toHaveBeenCalledWith(input)
    })

    test('500', async (): Promise<void> => {
      const createSpy = jest
        .spyOn(outgoingPaymentService, 'create')
        .mockRejectedValueOnce(new Error('unexpected'))

      const input = {
        paymentPointerId: uuid(),
        quoteId: uuid()
      }

      const query = await appContainer.apolloClient
        .query({
          query: gql`
            mutation CreateOutgoingPayment(
              $input: CreateOutgoingPaymentInput!
            ) {
              createOutgoingPayment(input: $input) {
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
          (query): OutgoingPaymentResponse => query.data?.createOutgoingPayment
        )
      expect(createSpy).toHaveBeenCalledWith(input)
      expect(query.code).toBe('500')
      expect(query.success).toBe(false)
      expect(query.message).toBe('Error trying to create outgoing payment')
      expect(query.payment).toBeNull()
    })
  })

  describe('Payment pointer outgoingPayments', (): void => {
    let paymentPointerId: string

    beforeEach(async (): Promise<void> => {
      paymentPointerId = (
        await createPaymentPointer(deps, {
          assetId: asset.id
        })
      ).id
    })

    getPageTests({
      getClient: () => appContainer.apolloClient,
      createModel: () =>
        createPayment({
          paymentPointerId
        }),
      pagedQuery: 'outgoingPayments',
      parent: {
        query: 'paymentPointer',
        getId: () => paymentPointerId
      }
    })
  })
})
