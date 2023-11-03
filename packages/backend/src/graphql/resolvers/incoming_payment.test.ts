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
import { createWalletAddress } from '../../tests/walletAddress'
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
  let walletAddressId: string
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

  describe('Wallet address incoming payments', (): void => {
    beforeEach(async (): Promise<void> => {
      walletAddressId = (await createWalletAddress(deps, { assetId: asset.id }))
        .id
    })

    getPageTests({
      getClient: () => appContainer.apolloClient,
      createModel: () =>
        createIncomingPayment(deps, {
          walletAddressId,
          incomingAmount: {
            value: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          metadata: {
            description: `IncomingPayment`,
            externalRef: '#123'
          }
        }),
      pagedQuery: 'incomingPayments',
      parent: {
        query: 'walletAddress',
        getId: () => walletAddressId
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
      metadata                                          | expiresAt                        | withAmount | desc
      ${{ description: 'rent', externalRef: '202201' }} | ${undefined}                     | ${false}   | ${'metadata'}
      ${undefined}                                      | ${new Date(Date.now() + 30_000)} | ${false}   | ${'expiresAt'}
      ${undefined}                                      | ${undefined}                     | ${true}    | ${'incomingAmount'}
    `(
      '200 ($desc)',
      async ({ metadata, expiresAt, withAmount }): Promise<void> => {
        const incomingAmount = withAmount ? amount : undefined
        const { id: walletAddressId } = await createWalletAddress(deps, {
          assetId: asset.id
        })
        const payment = await createIncomingPayment(deps, {
          walletAddressId,
          metadata,
          expiresAt,
          incomingAmount
        })

        const createSpy = jest
          .spyOn(incomingPaymentService, 'create')
          .mockResolvedValueOnce(payment)

        const input = {
          walletAddressId,
          incomingAmount,
          expiresAt,
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
                    walletAddressId
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
            walletAddressId,
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
            metadata: metadata || null,
            createdAt: payment.createdAt.toISOString()
          }
        })
      }
    )

    test('400', async (): Promise<void> => {
      const createSpy = jest
        .spyOn(incomingPaymentService, 'create')
        .mockResolvedValueOnce(IncomingPaymentError.UnknownWalletAddress)

      const input = {
        walletAddressId: uuid()
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
        errorToMessage[IncomingPaymentError.UnknownWalletAddress]
      )
      expect(query.payment).toBeNull()
      expect(createSpy).toHaveBeenCalledWith(input)
    })

    test('500', async (): Promise<void> => {
      const createSpy = jest
        .spyOn(incomingPaymentService, 'create')
        .mockRejectedValueOnce(new Error('unexpected'))

      const input = {
        walletAddressId: uuid()
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
      walletAddressId: string
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
        const { id: walletAddressId } = await createWalletAddress(deps, {
          assetId: asset.id
        })
        payment = await createPayment({ walletAddressId, metadata })
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
                  walletAddressId
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
          walletAddressId: payment.walletAddressId,
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
