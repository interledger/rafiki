import { ApolloError, gql } from '@apollo/client'
import { v4 as uuid } from 'uuid'
import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { Amount, serializeAmount } from '../../open_payments/amount'
import {
  mockIncomingPaymentWithPaymentMethods,
  mockWalletAddress
} from '@interledger/open-payments'
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

  const amount: Amount = {
    value: BigInt(123),
    assetCode: 'USD',
    assetScale: 2
  }
  const walletAddress = mockWalletAddress()

  describe('Mutation.createReceiver', (): void => {
    test.each`
      incomingAmount | expiresAt                        | metadata
      ${undefined}   | ${undefined}                     | ${undefined}
      ${amount}      | ${new Date(Date.now() + 30_000)} | ${{ description: 'Test incoming payment', externalRef: '#123' }}
    `(
      'creates receiver ($#)',
      async ({ metadata, expiresAt, incomingAmount }): Promise<void> => {
        const receiver = new Receiver(
          mockIncomingPaymentWithPaymentMethods({
            id: `${walletAddress.id}/incoming-payments/${uuid()}`,
            walletAddress: walletAddress.id,
            metadata,
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
          walletAddressUrl: walletAddress.id,
          incomingAmount,
          expiresAt,
          metadata
        }

        const query = await appContainer.apolloClient
          .query({
            query: gql`
              mutation CreateReceiver($input: CreateReceiverInput!) {
                createReceiver(input: $input) {
                  receiver {
                    id
                    walletAddressUrl
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
                    metadata
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
          receiver: {
            __typename: 'Receiver',
            id: receiver.incomingPayment?.id,
            walletAddressUrl: receiver.incomingPayment?.walletAddress,
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
            metadata: receiver.incomingPayment?.metadata || null,
            createdAt: receiver.incomingPayment?.createdAt.toISOString(),
            updatedAt: receiver.incomingPayment?.updatedAt.toISOString()
          }
        })
      }
    )

    test('returns error if error returned when creating receiver', async (): Promise<void> => {
      const createSpy = jest
        .spyOn(receiverService, 'create')
        .mockResolvedValueOnce(ReceiverError.UnknownWalletAddress)

      const input = {
        walletAddressUrl: walletAddress.id
      }

      const query = appContainer.apolloClient
        .query({
          query: gql`
            mutation CreateReceiver($input: CreateReceiverInput!) {
              createReceiver(input: $input) {
                receiver {
                  id
                  walletAddressUrl
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
                  metadata
                  createdAt
                  updatedAt
                }
              }
            }
          `,
          variables: { input }
        })
        .then((query): CreateReceiverResponse => query.data?.createReceiver)

      await expect(query).rejects.toThrow(ApolloError)
      await expect(query).rejects.toThrow('unknown wallet address')
      expect(createSpy).toHaveBeenCalledWith(input)
    })

    test('returns error if error thrown when creating receiver', async (): Promise<void> => {
      const createSpy = jest
        .spyOn(receiverService, 'create')
        .mockImplementationOnce((_) => {
          throw new Error('Cannot create receiver')
        })

      const input = {
        walletAddressUrl: walletAddress.id
      }

      const query = appContainer.apolloClient
        .query({
          query: gql`
            mutation CreateReceiver($input: CreateReceiverInput!) {
              createReceiver(input: $input) {
                receiver {
                  id
                  walletAddressUrl
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
                  metadata
                  createdAt
                  updatedAt
                }
              }
            }
          `,
          variables: { input }
        })
        .then((query): CreateReceiverResponse => query.data?.createReceiver)

      await expect(query).rejects.toThrow(ApolloError)
      await expect(query).rejects.toThrow('Cannot create receiver')
      expect(createSpy).toHaveBeenCalledWith(input)
    })
  })

  describe('Query.receiver', (): void => {
    const receiver = new Receiver(
      mockIncomingPaymentWithPaymentMethods({
        id: `${walletAddress.id}/incoming-payments/${uuid()}`,
        walletAddress: walletAddress.id,
        incomingAmount: amount ? serializeAmount(amount) : undefined
      })
    )

    test('returns receiver', async (): Promise<void> => {
      jest
        .spyOn(receiverService, 'get')
        .mockImplementation(async () => receiver)

      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query GetReceiver($id: String!) {
              receiver(id: $id) {
                id
                walletAddressUrl
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
                metadata
                createdAt
                updatedAt
              }
            }
          `,
          variables: {
            id: receiver.incomingPayment.id
          }
        })
        .then((query): Receiver => query.data?.receiver)

      expect(query).toEqual({
        __typename: 'Receiver',
        id: receiver.incomingPayment?.id,
        walletAddressUrl: receiver.incomingPayment?.walletAddress,
        completed: false,
        expiresAt: receiver.incomingPayment?.expiresAt?.toISOString() || null,
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
        metadata: receiver.incomingPayment?.metadata || null,
        createdAt: receiver.incomingPayment?.createdAt.toISOString(),
        updatedAt: receiver.incomingPayment?.updatedAt.toISOString()
      })
    })

    test('404', async (): Promise<void> => {
      jest
        .spyOn(receiverService, 'get')
        .mockImplementation(async () => undefined)

      await expect(
        appContainer.apolloClient.query({
          query: gql`
            query GetReceiver($id: String!) {
              receiver(id: $id) {
                id
              }
            }
          `,
          variables: { id: uuid() }
        })
      ).rejects.toThrow('receiver does not exist')
    })
  })
})
