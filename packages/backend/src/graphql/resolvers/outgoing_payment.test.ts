import nock from 'nock'
import { gql } from 'apollo-server-koa'
import Knex from 'knex'
import { StreamServer } from '@interledger/stream-receiver'
import { PaymentError, PaymentType } from '@interledger/pay'
import { v4 as uuid } from 'uuid'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import { OutgoingPaymentService } from '../../outgoing_payment/service'
import {
  OutgoingPayment as OutgoingPaymentModel,
  PaymentState
} from '../../outgoing_payment/model'
import {
  OutgoingPayment,
  OutgoingPaymentResponse,
  PaymentState as SchemaPaymentState,
  PaymentType as SchemaPaymentType
} from '../generated/graphql'
import { MockConnectorService } from '../../tests/mockConnectorService'

describe('OutgoingPayment Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let connectorService: MockConnectorService
  let knex: Knex

  const streamServer = new StreamServer({
    serverSecret: Buffer.from(
      '61a55774643daa45bec703385ea6911dbaaaa9b4850b77884f2b8257eef05836',
      'hex'
    ),
    serverAddress: 'test.wallet'
  })

  beforeAll(
    async (): Promise<void> => {
      connectorService = new MockConnectorService()
      deps = await initIocContainer(Config)
      deps.bind('connectorService', async (_deps) => connectorService)
      appContainer = await createTestApp(deps)
      knex = await deps.use('knex')

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

  afterAll(
    async (): Promise<void> => {
      await truncateTables(knex)
      await appContainer.apolloClient.stop()
      await appContainer.shutdown()
    }
  )

  let outgoingPaymentService: OutgoingPaymentService
  let payment: OutgoingPaymentModel

  beforeEach(
    async (): Promise<void> => {
      const accountService = await deps.use('accountService')
      const superAccountId = (await accountService.create(9, 'USD')).id
      const accountId = (await accountService.createSubAccount(superAccountId))
        .id
      outgoingPaymentService = await deps.use('outgoingPaymentService')
      payment = await OutgoingPaymentModel.query(knex).insertAndFetch({
        state: PaymentState.Inactive,
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
          minExchangeRate: 1.23,
          lowExchangeRateEstimate: 1.2,
          highExchangeRateEstimate: 2.3
        },
        superAccountId,
        sourceAccount: {
          id: accountId,
          scale: 9,
          code: 'USD'
        },
        destinationAccount: {
          scale: 9,
          code: 'XRP',
          url: 'http://wallet2.example/paymentpointer/bob'
        }
      })
    }
  )

  describe('Query.outgoingPayment', (): void => {
    test('200', async (): Promise<void> => {
      jest
        .spyOn(outgoingPaymentService, 'get')
        .mockImplementation(async () => payment)

      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query OutgoingPayment($paymentId: String!) {
              outgoingPayment(id: $paymentId) {
                id
                state
                error
                attempts
                intent {
                  paymentPointer
                  invoiceUrl
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
                sourceAccount {
                  scale
                  code
                }
                destinationAccount {
                  scale
                  code
                  url
                  paymentPointer
                }
                outcome {
                  amountSent
                  amountDelivered
                }
              }
            }
          `,
          variables: {
            paymentId: payment.id
          }
        })
        .then((query): OutgoingPayment => query.data?.outgoingPayment)

      expect(query.id).toEqual(payment.id)
      expect(query.state).toEqual(SchemaPaymentState.Inactive)
      expect(query.error).toBeNull()
      expect(query.attempts).toBe(0)
      expect(query.intent).toEqual({
        paymentPointer: 'http://wallet2.example/paymentpointer/bob',
        amountToSend: '123',
        invoiceUrl: null,
        autoApprove: false,
        __typename: 'PaymentIntent'
      })
      expect(query.quote).toEqual({
        timestamp: payment.quote?.timestamp.toISOString(),
        activationDeadline: payment.quote?.activationDeadline.toISOString(),
        targetType: SchemaPaymentType.FixedSend,
        minDeliveryAmount: '123',
        maxSourceAmount: '456',
        maxPacketAmount: '789',
        minExchangeRate: 1.23,
        lowExchangeRateEstimate: 1.2,
        highExchangeRateEstimate: 2.3,
        __typename: 'PaymentQuote'
      })
      expect(query.sourceAccount).toEqual({
        scale: 9,
        code: 'USD',
        __typename: 'PaymentSourceAccount'
      })
      expect(query.destinationAccount).toEqual({
        scale: 9,
        code: 'XRP',
        url: 'http://wallet2.example/paymentpointer/bob',
        paymentPointer: null,
        __typename: 'PaymentDestinationAccount'
      })
      expect(query.outcome).toEqual({
        amountSent: '0',
        amountDelivered: '0',
        __typename: 'PaymentProgress'
      })
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
    const input = {
      superAccountId: uuid(),
      paymentPointer: 'http://wallet2.example/paymentpointer/bob',
      amountToSend: '123',
      autoApprove: false
    }

    test('200', async (): Promise<void> => {
      jest
        .spyOn(outgoingPaymentService, 'create')
        .mockImplementation(async (args) => {
          expect(args).toEqual(input)
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
      expect(query.payment?.state).toBe(SchemaPaymentState.Inactive)
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

  describe(`Mutation.requoteOutgoingPayment`, (): void => {
    test('200', async (): Promise<void> => {
      const spy = jest
        .spyOn(outgoingPaymentService, 'requote')
        .mockImplementation(async (id: string) => {
          expect(id).toBe(payment.id)
          return payment
        })
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            mutation RequoteOutgoingPayment($paymentId: String!) {
              requoteOutgoingPayment(paymentId: $paymentId) {
                code
                success
                message
                payment {
                  id
                }
              }
            }
          `,
          variables: { paymentId: payment.id }
        })
        .then(
          (query): OutgoingPaymentResponse => query.data?.requoteOutgoingPayment
        )
      expect(spy).toHaveBeenCalledTimes(1)
      expect(query.code).toBe('200')
      expect(query.success).toBe(true)
      expect(query.message).toBeNull()
      expect(query.payment?.id).toBe(payment.id)
    })

    test('500', async (): Promise<void> => {
      const spy = jest
        .spyOn(outgoingPaymentService, 'requote')
        .mockImplementation(async (id: string) => {
          expect(id).toBe(payment.id)
          throw new Error('fail')
        })
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            mutation RequoteOutgoingPayment($paymentId: String!) {
              requoteOutgoingPayment(paymentId: $paymentId) {
                code
                success
                message
                payment {
                  id
                }
              }
            }
          `,
          variables: { paymentId: payment.id }
        })
        .then(
          (query): OutgoingPaymentResponse => query.data?.requoteOutgoingPayment
        )
      expect(spy).toHaveBeenCalledTimes(1)
      expect(query.code).toBe('500')
      expect(query.success).toBe(false)
      expect(query.message).toBe('fail')
      expect(query.payment).toBeNull()
    })
  })

  describe(`Mutation.approveOutgoingPayment`, (): void => {
    test('200', async (): Promise<void> => {
      const spy = jest
        .spyOn(outgoingPaymentService, 'approve')
        .mockImplementation(async (id: string) => {
          expect(id).toBe(payment.id)
          return payment
        })
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            mutation ApproveOutgoingPayment($paymentId: String!) {
              approveOutgoingPayment(paymentId: $paymentId) {
                code
                success
                message
                payment {
                  id
                }
              }
            }
          `,
          variables: { paymentId: payment.id }
        })
        .then(
          (query): OutgoingPaymentResponse => query.data?.approveOutgoingPayment
        )
      expect(spy).toHaveBeenCalledTimes(1)
      expect(query.code).toBe('200')
      expect(query.success).toBe(true)
      expect(query.message).toBeNull()
      expect(query.payment?.id).toBe(payment.id)
    })
  })

  describe(`Mutation.cancelOutgoingPayment`, (): void => {
    test('200', async (): Promise<void> => {
      const spy = jest
        .spyOn(outgoingPaymentService, 'cancel')
        .mockImplementation(async (id: string) => {
          expect(id).toBe(payment.id)
          return payment
        })
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            mutation CancelOutgoingPayment($paymentId: String!) {
              cancelOutgoingPayment(paymentId: $paymentId) {
                code
                success
                message
                payment {
                  id
                }
              }
            }
          `,
          variables: { paymentId: payment.id }
        })
        .then(
          (query): OutgoingPaymentResponse => query.data?.cancelOutgoingPayment
        )
      expect(spy).toHaveBeenCalledTimes(1)
      expect(query.code).toBe('200')
      expect(query.success).toBe(true)
      expect(query.message).toBeNull()
      expect(query.payment?.id).toBe(payment.id)
    })
  })
})
