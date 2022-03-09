import { gql } from 'apollo-server-koa'
import Knex from 'knex'
import { PaymentError, PaymentType } from '@interledger/pay'
import { v4 as uuid } from 'uuid'
import * as Pay from '@interledger/pay'

import { getPageTests } from './page.test'
import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { randomAsset } from '../../tests/asset'
import { truncateTables } from '../../tests/tableManager'
import { OutgoingPaymentError } from '../../open_payments/payment/outgoing/errors'
import {
  OutgoingPaymentService,
  CreateOutgoingPaymentOptions
} from '../../open_payments/payment/outgoing/service'
import {
  OutgoingPayment as OutgoingPaymentModel,
  PaymentState
} from '../../open_payments/payment/outgoing/model'
import { AccountingService } from '../../accounting/service'
import { AccountService } from '../../open_payments/account/service'
import {
  OutgoingPayment,
  OutgoingPaymentResponse,
  PaymentState as SchemaPaymentState,
  PaymentType as SchemaPaymentType
} from '../generated/graphql'

describe('OutgoingPayment Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let accountingService: AccountingService
  let outgoingPaymentService: OutgoingPaymentService
  let accountService: AccountService

  const receivingAccount = 'http://wallet2.example/pay/bob'
  const receivingPayment = 'http://wallet2.example/incoming/123'
  const sendAmount = {
    amount: BigInt(123),
    assetCode: randomAsset().code,
    assetScale: randomAsset().scale
  }

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      knex = await deps.use('knex')
      accountingService = await deps.use('accountingService')
      outgoingPaymentService = await deps.use('outgoingPaymentService')
      accountService = await deps.use('accountService')
    }
  )

  afterEach(
    async (): Promise<void> => {
      jest.restoreAllMocks()
      await truncateTables(knex)
    }
  )

  afterAll(
    async (): Promise<void> => {
      await appContainer.apolloClient.stop()
      await appContainer.shutdown()
    }
  )

  const createPayment = async ({
    accountId,
    receivingAccount,
    sendAmount: sendAmountOpts,
    receivingPayment,
    authorized
  }: CreateOutgoingPaymentOptions): Promise<OutgoingPaymentModel> =>
    OutgoingPaymentModel.query(knex).insertAndFetch({
      state: PaymentState.Pending,
      receivingAccount,
      sendAmount: sendAmountOpts
        ? {
            amount: sendAmountOpts.amount,
            assetCode: sendAmount.assetCode,
            assetScale: sendAmount.assetScale
          }
        : undefined,
      receivingPayment,
      quote: {
        timestamp: new Date(),
        activationDeadline: new Date(Date.now() + 1000),
        targetType: PaymentType.FixedSend,
        minDeliveryAmount: BigInt(123),
        maxSourceAmount: BigInt(456),
        maxPacketAmount: BigInt(789),
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        minExchangeRate: Pay.Ratio.from(1.23)!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        lowExchangeRateEstimate: Pay.Ratio.from(1.2)!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        highExchangeRateEstimate: Pay.Ratio.from(2.3)!,
        amountSent: BigInt(0)
      },
      accountId,
      authorized,
      destinationAccount: {
        scale: 9,
        code: 'XRP',
        url: 'http://wallet2.example/paymentpointer/bob'
      }
    })

  describe('Query.outgoingPayment', (): void => {
    let payment: OutgoingPaymentModel

    describe.each`
      receivingAccount    | sendAmount    | receivingPayment    | authorized | description
      ${receivingAccount} | ${sendAmount} | ${null}             | ${true}    | ${'fixed send'}
      ${null}             | ${null}       | ${receivingPayment} | ${false}   | ${'incoming payment'}
    `(
      '$description',
      ({
        receivingAccount,
        sendAmount,
        receivingPayment,
        authorized
      }): void => {
        beforeEach(
          async (): Promise<void> => {
            const { id: accountId } = await accountService.create({
              asset: sendAmount
                ? {
                    code: sendAmount.assetCode,
                    scale: sendAmount.assetScale
                  }
                : randomAsset()
            })
            payment = await createPayment({
              accountId,
              receivingAccount,
              sendAmount,
              receivingPayment,
              authorized
            })
          }
        )

        // Query with each payment state with and without an error
        const states: [PaymentState, PaymentError | null][] = Object.values(
          PaymentState
        ).flatMap((state) => [
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
                      accountId
                      state
                      authorized
                      error
                      stateAttempts
                      receivingAccount
                      receivingPayment
                      sendAmount {
                        amount
                        assetCode
                        assetScale
                      }
                      quote {
                        timestamp
                        activationDeadline
                        targetType
                        minDeliveryAmount
                        maxSourceAmount
                        maxPacketAmount
                        minExchangeRate
                        lowExchangeRateEstimate
                        highExchangeRateEstimate
                      }
                      destinationAccount {
                        scale
                        code
                        url
                      }
                      outcome {
                        amountSent
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

            expect(query.id).toEqual(payment.id)
            expect(query.accountId).toEqual(payment.accountId)
            expect(query.state).toEqual(state)
            expect(query.authorized).toEqual(payment.authorized)
            expect(query.error).toEqual(error)
            expect(query.stateAttempts).toBe(0)
            expect(query.receivingAccount).toEqual(receivingAccount)
            expect(query.sendAmount).toEqual(
              sendAmount
                ? {
                    amount: sendAmount.amount.toString() || null,
                    assetCode: sendAmount.assetCode,
                    assetScale: sendAmount.assetScale,
                    __typename: 'PaymentAmount'
                  }
                : null
            )
            expect(query.receivingPayment).toEqual(receivingPayment)
            expect(query.quote).toEqual({
              timestamp: payment.quote?.timestamp.toISOString(),
              activationDeadline: payment.quote?.activationDeadline.toISOString(),
              targetType: SchemaPaymentType.FixedSend,
              minDeliveryAmount: payment.quote?.minDeliveryAmount.toString(),
              maxSourceAmount: payment.quote?.maxSourceAmount.toString(),
              maxPacketAmount: payment.quote?.maxPacketAmount.toString(),
              minExchangeRate: payment.quote?.minExchangeRate.valueOf(),
              lowExchangeRateEstimate: payment.quote?.lowExchangeRateEstimate.valueOf(),
              highExchangeRateEstimate: payment.quote?.highExchangeRateEstimate.valueOf(),
              __typename: 'PaymentQuote'
            })
            expect(query.destinationAccount).toEqual({
              ...payment.destinationAccount,
              __typename: 'PaymentDestinationAccount'
            })
            expect(query.outcome).toEqual({
              amountSent: amountSent.toString(),
              __typename: 'OutgoingPaymentOutcome'
            })
            expect(new Date(query.createdAt)).toEqual(payment.createdAt)
          }
        )

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
      }
    )
  })

  describe('Mutation.createOutgoingPayment', (): void => {
    const input = {
      accountId: uuid(),
      receivingAccount,
      sendAmount
    }

    test.each`
      receivingAccount    | sendAmount                       | receivingPayment    | authorized   | description
      ${receivingAccount} | ${sendAmount}                    | ${null}             | ${true}      | ${'fixed send (authorized)'}
      ${receivingAccount} | ${{ amount: sendAmount.amount }} | ${null}             | ${false}     | ${'fixed send'}
      ${null}             | ${null}                          | ${receivingPayment} | ${undefined} | ${'incoming payment'}
    `(
      '200 ($description)',
      async ({
        receivingAccount,
        sendAmount,
        receivingPayment,
        authorized
      }): Promise<void> => {
        const { id: accountId } = await accountService.create({
          asset: randomAsset()
        })
        const input = {
          accountId,
          receivingAccount,
          sendAmount,
          receivingPayment,
          authorized
        }
        const payment = await createPayment(input)

        const createSpy = jest
          .spyOn(outgoingPaymentService, 'create')
          .mockResolvedValueOnce(payment)

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
            (query): OutgoingPaymentResponse =>
              query.data?.createOutgoingPayment
          )

        expect(createSpy).toHaveBeenCalledWith(input)
        expect(query.code).toBe('200')
        expect(query.success).toBe(true)
        expect(query.payment?.id).toBe(payment.id)
        expect(query.payment?.state).toBe(SchemaPaymentState.Pending)
      }
    )

    test('400', async (): Promise<void> => {
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
      expect(query.code).toBe('400')
      expect(query.success).toBe(false)
      expect(query.message).toBe(OutgoingPaymentError.UnknownAccount)
      expect(query.payment).toBeNull()
    })

    test('500', async (): Promise<void> => {
      const createSpy = jest
        .spyOn(outgoingPaymentService, 'create')
        .mockRejectedValueOnce(new Error('unexpected'))

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

  describe('Account outgoingPayments', (): void => {
    let accountId: string

    beforeEach(
      async (): Promise<void> => {
        accountId = (
          await accountService.create({
            asset: randomAsset()
          })
        ).id
      }
    )

    getPageTests({
      getClient: () => appContainer.apolloClient,
      createModel: () =>
        createPayment({
          accountId,
          receivingAccount,
          sendAmount
        }),
      pagedQuery: 'outgoingPayments',
      parent: {
        query: 'account',
        getId: () => accountId
      }
    })
  })
})
