import { gql } from '@apollo/client'
import { v4 as uuid } from 'uuid'
import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { Amount, serializeAmount } from '../../open_payments/amount'
import { mockIncomingPayment, mockPaymentPointer } from 'open-payments'
import { CreateReceiverResponse } from '../generated/graphql'
import { ReceiverService } from '../../open_payments/receiver/service'
import { Receiver } from '../../open_payments/receiver/model'
import { ReceiverError } from '../../open_payments/receiver/errors'

describe('Receiver Resolver', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let receiverService: ReceiverService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    receiverService = await deps.use('receiverService')
  })

  afterAll(async (): Promise<void> => {
    appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('Mutation.createReceiver', (): void => {
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
      'creates receiver ($#)',
      async ({
        description,
        externalRef,
        expiresAt,
        incomingAmount
      }): Promise<void> => {
        const receiver = Receiver.fromIncomingPayment(
          mockIncomingPayment({
            id: `${paymentPointer.id}/incoming-payments/${uuid()}`,
            paymentPointer: paymentPointer.id,
            description,
            externalRef,
            expiresAt: expiresAt?.toISOString(),
            incomingAmount: incomingAmount
              ? serializeAmount(incomingAmount)
              : undefined
          })
        )

        const createSpy = jest
          .spyOn(receiverService, 'create')
          .mockResolvedValueOnce(receiver)

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
              mutation CreateReceiver($input: CreateReceiverInput!) {
                createReceiver(input: $input) {
                  code
                  success
                  message
                  receiver {
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
          .then((query): CreateReceiverResponse => query.data?.createReceiver)

        expect(createSpy).toHaveBeenCalledWith(input)
        expect(query).toEqual({
          __typename: 'CreateReceiverResponse',
          code: '200',
          success: true,
          message: null,
          receiver: {
            __typename: 'Receiver',
            id: receiver.incomingPayment?.id,
            paymentPointerUrl: receiver.incomingPayment?.paymentPointer,
            completed: false,
            expiresAt:
              receiver.incomingPayment?.expiresAt?.toISOString() || null,
            incomingAmount:
              receiver.incomingPayment?.incomingAmount === undefined
                ? null
                : {
                    __typename: 'Amount',
                    ...serializeAmount(receiver.incomingPayment?.incomingAmount)
                  },
            receivedAmount: receiver.incomingPayment && {
              __typename: 'Amount',
              ...serializeAmount(receiver.incomingPayment.receivedAmount)
            },
            description: receiver.incomingPayment?.description || null,
            externalRef: receiver.incomingPayment?.externalRef || null,
            createdAt: receiver.incomingPayment?.createdAt.toISOString(),
            updatedAt: receiver.incomingPayment?.updatedAt.toISOString()
          }
        })
      }
    )

    test('returns error if error returned when creating receiver', async (): Promise<void> => {
      const createSpy = jest
        .spyOn(receiverService, 'create')
        .mockResolvedValueOnce(ReceiverError.UnknownPaymentPointer)

      const input = {
        paymentPointerUrl: paymentPointer.id
      }

      const query = await appContainer.apolloClient
        .query({
          query: gql`
            mutation CreateReceiver($input: CreateReceiverInput!) {
              createReceiver(input: $input) {
                code
                success
                message
                receiver {
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
        .then((query): CreateReceiverResponse => query.data?.createReceiver)

      expect(createSpy).toHaveBeenCalledWith(input)
      expect(query).toEqual({
        __typename: 'CreateReceiverResponse',
        code: '404',
        success: false,
        message: 'unknown payment pointer',
        receiver: null
      })
    })

    test('returns error if error thrown when creating receiver', async (): Promise<void> => {
      const createSpy = jest
        .spyOn(receiverService, 'create')
        .mockImplementationOnce((_) => {
          throw new Error('Cannot create receiver')
        })

      const input = {
        paymentPointerUrl: paymentPointer.id
      }

      const query = await appContainer.apolloClient
        .query({
          query: gql`
            mutation CreateReceiver($input: CreateReceiverInput!) {
              createReceiver(input: $input) {
                code
                success
                message
                receiver {
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
        .then((query): CreateReceiverResponse => query.data?.createReceiver)

      expect(createSpy).toHaveBeenCalledWith(input)
      expect(query).toEqual({
        __typename: 'CreateReceiverResponse',
        code: '500',
        success: false,
        message: 'Error trying to create receiver',
        receiver: null
      })
    })
  })
})
