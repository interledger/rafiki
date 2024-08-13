import { ApolloError, gql } from '@apollo/client'
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
import {
  createOutgoingPayment,
  CreateTestQuoteAndOutgoingPaymentOptions
} from '../../tests/outgoingPayment'
import { createWalletAddress } from '../../tests/walletAddress'
import { truncateTables } from '../../tests/tableManager'
import {
  OutgoingPaymentError,
  errorToMessage,
  errorToCode
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
import { faker } from '@faker-js/faker'
import { GraphQLErrorCode } from '../errors'

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

  const createPayment = async (
    options: {
      walletAddressId: string
      metadata?: Record<string, unknown>
    },
    grantId?: string
  ): Promise<OutgoingPaymentModel> => {
    const obj: CreateTestQuoteAndOutgoingPaymentOptions = {
      ...options,
      method: 'ilp',
      receiver: `${Config.openPaymentsUrl}/${uuid()}`,
      debitAmount: {
        value: BigInt(56),
        assetCode: asset.code,
        assetScale: asset.scale
      },
      validDestination: false
    }

    if (grantId) {
      obj.grant = { id: grantId }
    }

    return await createOutgoingPayment(deps, obj)
  }

  describe('Query.outgoingPayment', (): void => {
    let payment: OutgoingPaymentModel

    describe('grantId', (): void => {
      it('should return grantId', async (): Promise<void> => {
        const grantId = uuid()

        const { id: walletAddressId } = await createWalletAddress(deps, {
          assetId: asset.id
        })

        const payment = await createPayment({ walletAddressId }, grantId)

        const query = await appContainer.apolloClient
          .query({
            query: gql`
              query OutgoingPayment($paymentId: String!) {
                outgoingPayment(id: $paymentId) {
                  id
                  grantId
                  walletAddressId
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
          grantId: payment.grantId,
          walletAddressId: payment.walletAddressId,
          __typename: 'OutgoingPayment'
        })
      })
    })

    describe('metadata', (): void => {
      const metadata = {
        description: 'rent',
        externalRef: '202201'
      }

      beforeEach(async (): Promise<void> => {
        const { id: walletAddressId } = await createWalletAddress(deps, {
          assetId: asset.id
        })
        payment = await createPayment({ walletAddressId, metadata })
      })

      // Query with each payment state with and without an error
      const states: [OutgoingPaymentState, PaymentError | null][] =
        Object.values(OutgoingPaymentState).flatMap((state) => [
          [state, null],
          [state, Pay.PaymentError.ReceiverProtocolViolation]
        ])
      test.each(states)(
        '%s, error: %s',
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
                    walletAddressId
                    client
                    state
                    error
                    stateAttempts
                    receiver
                    liquidity
                    debitAmount {
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
                    metadata
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
            walletAddressId: payment.walletAddressId,
            client: payment.client,
            state,
            error,
            stateAttempts: 0,
            receiver: payment.receiver,
            liquidity: '0',
            debitAmount: {
              value: payment.debitAmount.value.toString(),
              assetCode: payment.debitAmount.assetCode,
              assetScale: payment.debitAmount.assetScale,
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
            metadata,
            quote: {
              id: payment.quote.id,
              // maxPacketAmount: payment.quote.maxPacketAmount.toString(),
              // minExchangeRate: payment.quote.minExchangeRate.valueOf(),
              // lowEstimatedExchangeRate:
              //   payment.quote.lowEstimatedExchangeRate.valueOf(),
              // highEstimatedExchangeRate:
              //   payment.quote.highEstimatedExchangeRate.valueOf(),
              createdAt: payment.quote.createdAt.toISOString(),
              expiresAt: payment.quote.expiresAt.toISOString(),
              __typename: 'Quote'
            },
            createdAt: payment.createdAt.toISOString(),
            __typename: 'OutgoingPayment'
          })
        }
      )

      test('with added liquidity', async (): Promise<void> => {
        await accountingService.createDeposit({
          id: uuid(),
          account: payment,
          amount: 100n
        })

        const query = await appContainer.apolloClient
          .query({
            query: gql`
              query OutgoingPayment($paymentId: String!) {
                outgoingPayment(id: $paymentId) {
                  id
                  liquidity
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
          liquidity: '100',
          __typename: 'OutgoingPayment'
        })
      })
    })

    test('not found', async (): Promise<void> => {
      jest
        .spyOn(outgoingPaymentService, 'get')
        .mockImplementation(async () => undefined)

      expect.assertions(2)
      try {
        await appContainer.apolloClient.query({
          query: gql`
            query OutgoingPayment($paymentId: String!) {
              outgoingPayment(id: $paymentId) {
                id
              }
            }
          `,
          variables: { paymentId: uuid() }
        })
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: 'payment does not exist',
            extensions: expect.objectContaining({
              code: GraphQLErrorCode.NotFound
            })
          })
        )
      }
    })
  })

  describe('Mutation.createOutgoingPayment', (): void => {
    const metadata = {
      description: 'rent',
      externalRef: '202201'
    }

    test('success (metadata)', async (): Promise<void> => {
      const { id: walletAddressId } = await createWalletAddress(deps, {
        assetId: asset.id
      })
      const payment = await createPayment({ walletAddressId, metadata })

      const createSpy = jest
        .spyOn(outgoingPaymentService, 'create')
        .mockResolvedValueOnce(payment)

      const input = {
        walletAddressId: payment.walletAddressId,
        quoteId: payment.quote.id
      }

      const query = await appContainer.apolloClient
        .query({
          query: gql`
            mutation CreateOutgoingPayment(
              $input: CreateOutgoingPaymentInput!
            ) {
              createOutgoingPayment(input: $input) {
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
      expect(query.payment?.id).toBe(payment.id)
      expect(query.payment?.state).toBe(SchemaPaymentState.Funding)
    })

    test('Fails if walletAddress unknown', async (): Promise<void> => {
      const createSpy = jest
        .spyOn(outgoingPaymentService, 'create')
        .mockResolvedValueOnce(OutgoingPaymentError.UnknownWalletAddress)

      const input = {
        walletAddressId: uuid(),
        quoteId: uuid()
      }

      expect.assertions(3)
      try {
        await appContainer.apolloClient
          .query({
            query: gql`
              mutation CreateOutgoingPayment(
                $input: CreateOutgoingPaymentInput!
              ) {
                createOutgoingPayment(input: $input) {
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
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: errorToMessage[OutgoingPaymentError.UnknownWalletAddress],
            extensions: expect.objectContaining({
              code: errorToCode[OutgoingPaymentError.UnknownWalletAddress]
            })
          })
        )
      }
      expect(createSpy).toHaveBeenCalledWith(input)
    })

    test('internal server error', async (): Promise<void> => {
      const createSpy = jest
        .spyOn(outgoingPaymentService, 'create')
        .mockRejectedValueOnce(new Error('unexpected'))

      const input = {
        walletAddressId: uuid(),
        quoteId: uuid()
      }

      expect.assertions(3)
      try {
        await appContainer.apolloClient
          .query({
            query: gql`
              mutation CreateOutgoingPayment(
                $input: CreateOutgoingPaymentInput!
              ) {
                createOutgoingPayment(input: $input) {
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
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: 'unexpected',
            extensions: expect.objectContaining({
              code: GraphQLErrorCode.InternalServerError
            })
          })
        )
      }
      expect(createSpy).toHaveBeenCalledWith(input)
    })
  })

  describe('Mutation.createOutgoingPaymentFromIncomingPayment', (): void => {
    const mockIncomingPaymentUrl = `https://${faker.internet.domainName()}/incoming-payments/${uuid()}`

    test('create', async (): Promise<void> => {
      const walletAddress = await createWalletAddress(deps, {
        assetId: asset.id
      })
      const payment = await createPayment({ walletAddressId: walletAddress.id })

      const createSpy = jest
        .spyOn(outgoingPaymentService, 'create')
        .mockResolvedValueOnce(payment)

      const input = {
        walletAddressId: payment.walletAddressId,
        incomingPayment: mockIncomingPaymentUrl,
        debitAmount: {
          value: BigInt(56),
          assetCode: asset.code,
          assetScale: asset.scale
        }
      }

      const query = await appContainer.apolloClient
        .query({
          query: gql`
            mutation CreateOutgoingPaymentFromIncomingPayment(
              $input: CreateOutgoingPaymentFromIncomingPaymentInput!
            ) {
              createOutgoingPaymentFromIncomingPayment(input: $input) {
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
            query.data?.createOutgoingPaymentFromIncomingPayment
        )

      expect(createSpy).toHaveBeenCalledWith(input)
      expect(query.payment?.id).toBe(payment.id)
      expect(query.payment?.state).toBe(SchemaPaymentState.Funding)
    })

    test('unknown wallet address', async (): Promise<void> => {
      const createSpy = jest
        .spyOn(outgoingPaymentService, 'create')
        .mockResolvedValueOnce(OutgoingPaymentError.UnknownWalletAddress)

      const input = {
        walletAddressId: uuid(),
        incomingPayment: mockIncomingPaymentUrl,
        debitAmount: {
          value: BigInt(56),
          assetCode: asset.code,
          assetScale: asset.scale
        }
      }

      expect.assertions(3)
      try {
        await appContainer.apolloClient
          .query({
            query: gql`
              mutation CreateOutgoingPaymentFromIncomingPayment(
                $input: CreateOutgoingPaymentFromIncomingPaymentInput!
              ) {
                createOutgoingPaymentFromIncomingPayment(input: $input) {
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
              query.data?.createOutgoingPaymentFromIncomingPayment
          )
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: errorToMessage[OutgoingPaymentError.UnknownWalletAddress],
            extensions: expect.objectContaining({
              code: errorToCode[OutgoingPaymentError.UnknownWalletAddress]
            })
          })
        )
      }
      expect(createSpy).toHaveBeenCalledWith(input)
    })

    test('unknown error', async (): Promise<void> => {
      const createSpy = jest
        .spyOn(outgoingPaymentService, 'create')
        .mockRejectedValueOnce(new Error('unexpected'))

      const input = {
        walletAddressId: uuid(),
        incomingPayment: mockIncomingPaymentUrl,
        debitAmount: {
          value: BigInt(56),
          assetCode: asset.code,
          assetScale: asset.scale
        }
      }

      expect.assertions(3)
      try {
        await appContainer.apolloClient
          .query({
            query: gql`
              mutation CreateOutgoingPaymentFromIncomingPayment(
                $input: CreateOutgoingPaymentFromIncomingPaymentInput!
              ) {
                createOutgoingPaymentFromIncomingPayment(input: $input) {
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
              query.data?.createOutgoingPaymentFromIncomingPayment
          )
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: 'unexpected',
            extensions: expect.objectContaining({
              code: GraphQLErrorCode.InternalServerError
            })
          })
        )
      }
      expect(createSpy).toHaveBeenCalledWith(input)
    })
  })

  describe('Mutation.cancelOutgoingPayment', (): void => {
    let payment: OutgoingPaymentModel
    beforeEach(async () => {
      const walletAddress = await createWalletAddress(deps, {
        assetId: asset.id
      })

      payment = await createPayment({ walletAddressId: walletAddress.id })
    })

    const reasons: (string | undefined)[] = [undefined, 'Not enough balance']
    test.each(reasons)(
      'should cancel outgoing payment with reason %s',
      async (reason): Promise<void> => {
        const input = {
          id: payment.id,
          reason
        }

        payment.state = OutgoingPaymentState.Cancelled
        payment.metadata = {
          cancellationReason: input.reason
        }

        const cancelSpy = jest
          .spyOn(outgoingPaymentService, 'cancel')
          .mockResolvedValue(payment)

        const mutationResponse = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation CancelOutgoingPayment(
                $input: CancelOutgoingPaymentInput!
              ) {
                cancelOutgoingPayment(input: $input) {
                  payment {
                    id
                    state
                    metadata
                  }
                }
              }
            `,
            variables: { input }
          })
          .then(
            (query): OutgoingPaymentResponse =>
              query.data?.cancelOutgoingPayment
          )

        expect(cancelSpy).toHaveBeenCalledWith(input)
        expect(mutationResponse.payment).toEqual({
          __typename: 'OutgoingPayment',
          id: input.id,
          state: OutgoingPaymentState.Cancelled,
          metadata: {
            cancellationReason: input.reason
          }
        })
      }
    )

    const errors: [OutgoingPaymentError][] = [
      [OutgoingPaymentError.WrongState],
      [OutgoingPaymentError.UnknownPayment]
    ]
    test.each(errors)(
      '%s - outgoing payment error',
      async (paymentError): Promise<void> => {
        const cancelSpy = jest
          .spyOn(outgoingPaymentService, 'cancel')
          .mockResolvedValueOnce(paymentError)

        const input = { id: uuid() }

        expect.assertions(3)
        try {
          await appContainer.apolloClient
            .mutate({
              mutation: gql`
                mutation CancelOutgoingPayment(
                  $input: CancelOutgoingPaymentInput!
                ) {
                  cancelOutgoingPayment(input: $input) {
                    payment {
                      id
                      state
                      metadata
                    }
                  }
                }
              `,
              variables: { input }
            })
            .then(
              (query): OutgoingPaymentResponse =>
                query.data?.cancelOutgoingPayment
            )
        } catch (error) {
          expect(error).toBeInstanceOf(ApolloError)
          expect((error as ApolloError).graphQLErrors).toContainEqual(
            expect.objectContaining({
              message: errorToMessage[paymentError],
              extensions: expect.objectContaining({
                code: errorToCode[paymentError]
              })
            })
          )
        }
        expect(cancelSpy).toHaveBeenCalledWith(input)
      }
    )
  })

  describe('Wallet address outgoingPayments', (): void => {
    let walletAddressId: string

    beforeEach(async (): Promise<void> => {
      walletAddressId = (
        await createWalletAddress(deps, {
          assetId: asset.id
        })
      ).id
    })

    getPageTests({
      getClient: () => appContainer.apolloClient,
      createModel: () =>
        createPayment({
          walletAddressId
        }),
      pagedQuery: 'outgoingPayments',
      parent: {
        query: 'walletAddress',
        getId: () => walletAddressId
      }
    })
  })
})
