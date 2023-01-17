import { gql } from 'apollo-server-koa'
import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { Amount, serializeAmount } from '../../open_payments/amount'
import {
  mockIncomingPayment,
  mockPaymentPointer
} from '../../tests/openPaymentsMocks'
import { RemoteIncomingPaymentService } from '../../open_payments/payment/incoming_remote/service'
import { RemoteIncomingPaymentResponse } from '../generated/graphql'

describe('Remote Incoming Payment Resolver', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let remoteIncomingPaymentService: RemoteIncomingPaymentService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    remoteIncomingPaymentService = await deps.use(
      'remoteIncomingPaymentService'
    )
  })

  afterAll(async (): Promise<void> => {
    appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('Mutation.createRemoteIncomingPayment', (): void => {
    const amount: Amount = {
      value: BigInt(123),
      assetCode: 'USD',
      assetScale: 2
    }
    const paymentPointer = mockPaymentPointer()

    test.each`
      incomingAmount | expiresAt                        | description                | externalRef
      ${undefined}   | ${undefined}                     | ${undefined}               | ${undefined}
      ${amount}      | ${new Date(Date.now() + 30_000)} | ${'Test incoming payment'} | ${'#123'}
    `(
      'creates remote incoming payment ($#)',
      async ({
        description,
        externalRef,
        expiresAt,
        incomingAmount
      }): Promise<void> => {
        const payment = mockIncomingPayment({
          paymentPointer: paymentPointer.id,
          description,
          externalRef,
          expiresAt: expiresAt?.toISOString(),
          incomingAmount: incomingAmount
            ? serializeAmount(incomingAmount)
            : undefined
        })

        const createSpy = jest
          .spyOn(remoteIncomingPaymentService, 'create')
          .mockResolvedValueOnce(payment)

        const input = {
          paymentPointerUrl: paymentPointer.id,
          incomingAmount,
          expiresAt,
          description,
          externalRef
        }

        const query = await appContainer.apolloClient
          .query({
            query: gql`
              mutation CreateRemoteIncomingPayment(
                $input: CreateRemoteIncomingPaymentInput!
              ) {
                createRemoteIncomingPayment(input: $input) {
                  code
                  success
                  message
                  payment {
                    id
                    paymentPointerUrl
                    completed
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
                    updatedAt
                  }
                }
              }
            `,
            variables: { input }
          })
          .then(
            (query): RemoteIncomingPaymentResponse =>
              query.data?.createRemoteIncomingPayment
          )

        expect(createSpy).toHaveBeenCalledWith(input)
        expect(query).toEqual({
          __typename: 'RemoteIncomingPaymentResponse',
          code: '200',
          success: true,
          message: null,
          payment: {
            __typename: 'RemoteIncomingPayment',
            id: payment.id,
            paymentPointerUrl: payment.paymentPointer,
            completed: false,
            expiresAt: payment.expiresAt || null,
            incomingAmount:
              incomingAmount === undefined
                ? null
                : {
                    __typename: 'Amount',
                    ...payment.incomingAmount
                  },
            receivedAmount: {
              __typename: 'Amount',
              ...payment.receivedAmount
            },
            description: payment.description || null,
            externalRef: payment.externalRef || null,
            createdAt: payment.createdAt,
            updatedAt: payment.updatedAt
          }
        })
      }
    )

    test('returns 500 if cannot create remote incoming payment', async (): Promise<void> => {
      const createSpy = jest
        .spyOn(remoteIncomingPaymentService, 'create')
        .mockImplementationOnce(() => {
          throw new Error('Cannot create incoming payment')
        })

      const input = {
        paymentPointerUrl: paymentPointer.id
      }

      const query = await appContainer.apolloClient
        .query({
          query: gql`
            mutation CreateRemoteIncomingPayment(
              $input: CreateRemoteIncomingPaymentInput!
            ) {
              createRemoteIncomingPayment(input: $input) {
                code
                success
                message
                payment {
                  id
                  paymentPointerUrl
                  completed
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
                  updatedAt
                }
              }
            }
          `,
          variables: { input }
        })
        .then(
          (query): RemoteIncomingPaymentResponse =>
            query.data?.createRemoteIncomingPayment
        )

      expect(createSpy).toHaveBeenCalledWith(input)
      expect(query).toEqual({
        __typename: 'RemoteIncomingPaymentResponse',
        code: '500',
        success: false,
        message: 'Error trying to create remote incoming payment',
        payment: null
      })
    })
  })
})
