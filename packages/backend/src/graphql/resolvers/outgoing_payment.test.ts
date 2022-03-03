import nock from 'nock'
import { gql } from 'apollo-server-koa'
import Knex from 'knex'
import { StreamServer } from '@interledger/stream-receiver'
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
import { OutgoingPaymentService } from '../../outgoing_payment/service'
import {
  OutgoingPayment as OutgoingPaymentModel,
  PaymentState
} from '../../outgoing_payment/model'
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

  const streamServer = new StreamServer({
    serverSecret: Buffer.from(
      '61a55774643daa45bec703385ea6911dbaaaa9b4850b77884f2b8257eef05836',
      'hex'
    ),
    serverAddress: 'test.wallet'
  })

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      knex = await deps.use('knex')
      accountingService = await deps.use('accountingService')
      outgoingPaymentService = await deps.use('outgoingPaymentService')
      accountService = await deps.use('accountService')

      const credentials = streamServer.generateCredentials({
        asset: {
          code: 'XRP',
          scale: 9
        }
      })
      nock('http://wallet2.example')
        .get('/paymentpointer/bob')
        .reply(200, {
          destination_account: credentials.ilpAddress,
          shared_secret: credentials.sharedSecret.toString('base64')
        })
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

  const createPayment = async (
    accountId: string
  ): Promise<OutgoingPaymentModel> =>
    OutgoingPaymentModel.query(knex).insertAndFetch({
      state: PaymentState.Quoting,
      intent: {
        paymentPointer: 'http://wallet2.example/paymentpointer/bob',
        amountToSend: BigInt(123),
        autoApprove: false
      },
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
      destinationAccount: {
        scale: 9,
        code: 'XRP',
        url: 'http://wallet2.example/paymentpointer/bob'
      }
    })

  describe('Query.outgoingPayment', (): void => {
    let payment: OutgoingPaymentModel

    beforeEach(
      async (): Promise<void> => {
        const { id: accountId } = await accountService.create({
          asset: randomAsset()
        })
        payment = await createPayment(accountId)
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
                  error
                  stateAttempts
                  intent {
                    paymentPointer
                    incomingPaymentUrl
                    amountToSend
                    autoApprove
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
        expect(query.error).toEqual(error)
        expect(query.stateAttempts).toBe(0)
        expect(query.intent).toEqual({
          ...payment.intent,
          amountToSend: payment.intent?.amountToSend?.toString(),
          incomingPaymentUrl: null,
          __typename: 'PaymentIntent'
        })
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
  })

  describe('Mutation.createOutgoingPayment', (): void => {
    const input = {
      accountId: uuid(),
      paymentPointer: 'http://wallet2.example/paymentpointer/bob',
      amountToSend: '123',
      autoApprove: false
    }

    test('200', async (): Promise<void> => {
      const { id: accountId } = await accountService.create({
        asset: randomAsset()
      })
      const payment = await createPayment(accountId)

      jest
        .spyOn(outgoingPaymentService, 'create')
        .mockImplementation(async (args) => {
          expect(args).toEqual({
            ...input,
            amountToSend: BigInt(input.amountToSend)
          })
          return payment
        })

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

      expect(query.code).toBe('200')
      expect(query.success).toBe(true)
      expect(query.payment?.id).toBe(payment.id)
      expect(query.payment?.state).toBe(SchemaPaymentState.Quoting)
    })

    test('400', async (): Promise<void> => {
      jest
        .spyOn(outgoingPaymentService, 'create')
        .mockImplementation(async (_args) => {
          throw PaymentError.InvalidPaymentPointer
        })

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
      expect(query.message).toBe(PaymentError.InvalidPaymentPointer)
      expect(query.payment).toBeNull()
    })

    test('500', async (): Promise<void> => {
      jest
        .spyOn(outgoingPaymentService, 'create')
        .mockImplementation(async (_args) => {
          throw PaymentError.ReceiverProtocolViolation
        })

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
      expect(query.code).toBe('500')
      expect(query.success).toBe(false)
      expect(query.message).toBe(PaymentError.ReceiverProtocolViolation)
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
      createModel: () => createPayment(accountId),
      pagedQuery: 'outgoingPayments',
      parent: {
        query: 'account',
        getId: () => accountId
      }
    })
  })
})
