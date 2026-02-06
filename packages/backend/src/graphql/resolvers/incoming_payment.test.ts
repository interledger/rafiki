import {
  ApolloClient,
  ApolloError,
  NormalizedCacheObject,
  gql
} from '@apollo/client'
import { getPageTests } from './page.test'
import {
  createApolloClient,
  createTestApp,
  TestContainer
} from '../../tests/app'
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
import { AccountingService } from '../../accounting/service'
import {
  IncomingPayment as IncomingPaymentModel,
  IncomingPaymentState
} from '../../open_payments/payment/incoming/model'
import { IncomingPaymentInitiationReason } from '../../open_payments/payment/incoming/types'
import {
  IncomingPayment,
  IncomingPaymentConnection,
  IncomingPaymentResponse,
  IncomingPaymentState as SchemaPaymentState,
  ConfirmPartialIncomingPaymentResponse
} from '../generated/graphql'
import {
  IncomingPaymentError,
  errorToMessage,
  errorToCode
} from '../../open_payments/payment/incoming/errors'
import { Amount, serializeAmount } from '../../open_payments/amount'
import { GraphQLErrorCode } from '../errors'
import { createTenant } from '../../tests/tenant'
import { faker } from '@faker-js/faker'
import { WalletAddress } from '../../open_payments/wallet_address/model'
import Redis from 'ioredis'

describe('Incoming Payment Resolver', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let walletAddressId: string
  let client: string
  let incomingPaymentService: IncomingPaymentService
  let accountingService: AccountingService
  let asset: Asset
  let tenantId: string

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    incomingPaymentService = await deps.use('incomingPaymentService')
    accountingService = await deps.use('accountingService')
    asset = await createAsset(deps)
    tenantId = Config.operatorTenantId
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(async (): Promise<void> => {
    await truncateTables(deps)
    await appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('Wallet address incoming payments', (): void => {
    beforeEach(async (): Promise<void> => {
      walletAddressId = (
        await createWalletAddress(deps, {
          tenantId: Config.operatorTenantId,
          assetId: asset.id
        })
      ).id
    })

    getPageTests({
      getClient: () => appContainer.apolloClient,
      createModel: () =>
        createIncomingPayment(deps, {
          walletAddressId,
          client,
          incomingAmount: {
            value: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          metadata: {
            description: `IncomingPayment`,
            externalRef: '#123'
          },
          tenantId,
          initiationReason: IncomingPaymentInitiationReason.Admin
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
    let senderWalletAddress: string

    beforeEach((): void => {
      amount = {
        value: BigInt(56),
        assetCode: asset.code,
        assetScale: asset.scale
      }
      client = 'incoming-payment-client-create'
      senderWalletAddress = faker.internet.url()
    })

    test.each`
      metadata                                          | expiresAt                        | withAmount | desc
      ${{ description: 'rent', externalRef: '202201' }} | ${undefined}                     | ${false}   | ${'metadata'}
      ${undefined}                                      | ${new Date(Date.now() + 30_000)} | ${false}   | ${'expiresAt'}
      ${undefined}                                      | ${undefined}                     | ${true}    | ${'incomingAmount'}
    `(
      'Successfully creates an incoming payment with $desc',
      async ({ metadata, expiresAt, withAmount }): Promise<void> => {
        const incomingAmount = withAmount ? amount : undefined
        const { id: walletAddressId } = await createWalletAddress(deps, {
          tenantId: Config.operatorTenantId,
          assetId: asset.id
        })
        const payment = await createIncomingPayment(deps, {
          walletAddressId,
          client,
          metadata,
          expiresAt,
          incomingAmount,
          tenantId,
          initiationReason: IncomingPaymentInitiationReason.Admin,
          senderWalletAddress
        })

        const createSpy = jest
          .spyOn(incomingPaymentService, 'create')
          .mockResolvedValueOnce(payment)

        const input = {
          walletAddressId,
          incomingAmount,
          expiresAt,
          metadata,
          senderWalletAddress
        }

        const query = await appContainer.apolloClient
          .query({
            query: gql`
              mutation CreateIncomingPayment(
                $input: CreateIncomingPaymentInput!
              ) {
                createIncomingPayment(input: $input) {
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
                    senderWalletAddress
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

        expect(createSpy).toHaveBeenCalledWith({
          ...input,
          tenantId,
          initiationReason: IncomingPaymentInitiationReason.Admin
        })
        expect(query).toEqual({
          __typename: 'IncomingPaymentResponse',
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
            createdAt: payment.createdAt.toISOString(),
            senderWalletAddress
          }
        })
      }
    )

    test('Errors when unknown wallet address', async (): Promise<void> => {
      const createSpy = jest
        .spyOn(incomingPaymentService, 'create')
        .mockResolvedValueOnce(IncomingPaymentError.UnknownWalletAddress)

      const input = {
        walletAddressId: uuid()
      }

      expect.assertions(3)
      try {
        await appContainer.apolloClient
          .query({
            query: gql`
              mutation CreateIncomingPayment(
                $input: CreateIncomingPaymentInput!
              ) {
                createIncomingPayment(input: $input) {
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
            (query): IncomingPaymentResponse =>
              query.data?.createIncomingPayment
          )
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: errorToMessage[IncomingPaymentError.UnknownWalletAddress],
            extensions: expect.objectContaining({
              code: errorToCode[IncomingPaymentError.UnknownWalletAddress]
            })
          })
        )
      }
      expect(createSpy).toHaveBeenCalledWith({
        ...input,
        tenantId,
        initiationReason: IncomingPaymentInitiationReason.Admin
      })
    })

    test('Internal server error', async (): Promise<void> => {
      const createSpy = jest
        .spyOn(incomingPaymentService, 'create')
        .mockRejectedValueOnce(new Error('unexpected'))

      const input = {
        walletAddressId: uuid()
      }

      expect.assertions(3)
      try {
        await appContainer.apolloClient
          .query({
            query: gql`
              mutation CreateIncomingPayment(
                $input: CreateIncomingPaymentInput!
              ) {
                createIncomingPayment(input: $input) {
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
            (query): IncomingPaymentResponse =>
              query.data?.createIncomingPayment
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
      expect(createSpy).toHaveBeenCalledWith({
        ...input,
        tenantId,
        initiationReason: IncomingPaymentInitiationReason.Admin
      })
    })

    describe('tenant boundaries', (): void => {
      test('operator can label incoming payment as card payment', async (): Promise<void> => {
        const createSpy = jest.spyOn(incomingPaymentService, 'create')

        const input = {
          walletAddressId,
          isCardPayment: true
        }

        const query = await appContainer.apolloClient
          .query({
            query: gql`
              mutation CreateIncomingPayment(
                $input: CreateIncomingPaymentInput!
              ) {
                createIncomingPayment(input: $input) {
                  payment {
                    id
                    walletAddressId
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

        expect(createSpy).toHaveBeenCalledWith({
          walletAddressId: input.walletAddressId,
          tenantId,
          initiationReason: IncomingPaymentInitiationReason.Card
        })
        expect(query).toEqual({
          __typename: 'IncomingPaymentResponse',
          payment: {
            __typename: 'IncomingPayment',
            id: expect.any(String),
            walletAddressId
          }
        })
      })

      test('tenant cannot label incoming payment as card payment', async (): Promise<void> => {
        const tenant = await createTenant(deps)
        const tenantWalletAddress = await createWalletAddress(deps, {
          tenantId: tenant.id
        })
        const createSpy = jest.spyOn(incomingPaymentService, 'create')

        const input = {
          walletAddressId: tenantWalletAddress.id,
          isCardPayment: true
        }

        const tenantedApolloClient = await createApolloClient(
          appContainer.container,
          appContainer.app,
          tenant.id
        )
        const query = await tenantedApolloClient
          .query({
            query: gql`
              mutation CreateIncomingPayment(
                $input: CreateIncomingPaymentInput!
              ) {
                createIncomingPayment(input: $input) {
                  payment {
                    id
                    walletAddressId
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

        expect(createSpy).toHaveBeenCalledWith({
          walletAddressId: input.walletAddressId,
          tenantId: tenant.id,
          initiationReason: IncomingPaymentInitiationReason.Admin
        })
        expect(query).toEqual({
          __typename: 'IncomingPaymentResponse',
          payment: {
            __typename: 'IncomingPayment',
            id: expect.any(String),
            walletAddressId: tenantWalletAddress.id
          }
        })
      })
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
        },
        tenantId,
        initiationReason: IncomingPaymentInitiationReason.Admin
      })
    }

    describe('metadata', (): void => {
      const metadata = {
        description: 'rent',
        externalRef: '202201'
      }
      beforeEach(async (): Promise<void> => {
        const { id: walletAddressId } = await createWalletAddress(deps, {
          tenantId: Config.operatorTenantId,
          assetId: asset.id
        })
        payment = await createPayment({ walletAddressId, metadata })
      })

      // Query with each payment state
      const states: IncomingPaymentState[] = Object.values(IncomingPaymentState)
      test.each(states)('%s', async (state): Promise<void> => {
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
                  liquidity
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
          liquidity: '0',
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

      test('with added liquidity', async (): Promise<void> => {
        await accountingService.createDeposit({
          id: uuid(),
          account: payment,
          amount: 100n
        })

        const query = await appContainer.apolloClient
          .query({
            query: gql`
              query IncomingPayment($paymentId: String!) {
                incomingPayment(id: $paymentId) {
                  id
                  liquidity
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
          liquidity: '100',
          __typename: 'IncomingPayment'
        })
      })

      test('with tenant', async (): Promise<void> => {
        const query = await appContainer.apolloClient
          .query({
            query: gql`
              query IncomingPayment($paymentId: String!) {
                incomingPayment(id: $paymentId) {
                  id
                  tenant {
                    id
                  }
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
          tenant: {
            __typename: 'Tenant',
            id: payment.tenantId
          },
          __typename: 'IncomingPayment'
        })
      })
    })

    test('not found', async (): Promise<void> => {
      jest
        .spyOn(incomingPaymentService, 'get')
        .mockImplementation(async () => undefined)

      expect.assertions(2)
      try {
        await appContainer.apolloClient.query({
          query: gql`
            query IncomingPayment($paymentId: String!) {
              incomingPayment(id: $paymentId) {
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

  describe('Mutation.updateIncomingPayment', (): void => {
    let amount: Amount
    let expiresAt: Date

    beforeEach((): void => {
      amount = {
        value: BigInt(56),
        assetCode: asset.code,
        assetScale: asset.scale
      }
      expiresAt = new Date(Date.now() + 30_000)
    })

    test.each`
      metadata
      ${{ description: 'Update metadata', status: 'COMPLETE' }}
      ${{}}
    `(
      'Successfully updates an incoming payment with $metadata',
      async ({ metadata }): Promise<void> => {
        const incomingAmount = amount ? amount : undefined
        const { id: walletAddressId } = await createWalletAddress(deps, {
          tenantId: Config.operatorTenantId,
          assetId: asset.id
        })
        const payment = await createIncomingPayment(deps, {
          walletAddressId,
          metadata,
          expiresAt,
          incomingAmount,
          tenantId,
          initiationReason: IncomingPaymentInitiationReason.Admin
        })
        const input = {
          id: payment.id,
          metadata
        }

        const createSpy = jest
          .spyOn(incomingPaymentService, 'update')
          .mockResolvedValueOnce({
            ...payment,
            getUrl: payment.getUrl,
            metadata: input.metadata
          } as IncomingPaymentModel)

        const query = await appContainer.apolloClient
          .query({
            query: gql`
              mutation UpdateIncomingPayment(
                $input: UpdateIncomingPaymentInput!
              ) {
                updateIncomingPayment(input: $input) {
                  payment {
                    id
                    metadata
                  }
                }
              }
            `,
            variables: { input }
          })
          .then(
            (query): IncomingPaymentResponse =>
              query.data?.updateIncomingPayment
          )

        expect(createSpy).toHaveBeenCalledWith({ ...input, tenantId })
        expect(query).toEqual({
          __typename: 'IncomingPaymentResponse',
          payment: {
            __typename: 'IncomingPayment',
            id: payment.id,
            metadata: metadata || null
          }
        })
      }
    )

    test('Errors when unknown payment id', async (): Promise<void> => {
      const createSpy = jest
        .spyOn(incomingPaymentService, 'update')
        .mockResolvedValueOnce(IncomingPaymentError.UnknownPayment)

      const input = {
        id: uuid(),
        metadata: { description: 'Update metadata', status: 'COMPLETE' }
      }

      expect.assertions(3)
      try {
        await appContainer.apolloClient
          .query({
            query: gql`
              mutation UpdateIncomingPayment(
                $input: UpdateIncomingPaymentInput!
              ) {
                updateIncomingPayment(input: $input) {
                  payment {
                    id
                    metadata
                  }
                }
              }
            `,
            variables: { input }
          })
          .then(
            (query): IncomingPaymentResponse =>
              query.data?.updateIncomingPayment
          )
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: errorToMessage[IncomingPaymentError.UnknownPayment],
            extensions: expect.objectContaining({
              code: errorToCode[IncomingPaymentError.UnknownPayment]
            })
          })
        )
      }
      expect(createSpy).toHaveBeenCalledWith({ ...input, tenantId })
    })

    test('Internal server error', async (): Promise<void> => {
      const createSpy = jest
        .spyOn(incomingPaymentService, 'update')
        .mockRejectedValueOnce(new Error('unexpected'))

      const input = {
        id: uuid(),
        metadata: {}
      }

      expect.assertions(3)
      try {
        await appContainer.apolloClient
          .query({
            query: gql`
              mutation UpdateIncomingPayment(
                $input: UpdateIncomingPaymentInput!
              ) {
                updateIncomingPayment(input: $input) {
                  payment {
                    id
                    metadata
                  }
                }
              }
            `,
            variables: { input }
          })
          .then(
            (query): IncomingPaymentResponse =>
              query.data?.updateIncomingPayment
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
      expect(createSpy).toHaveBeenCalledWith({ ...input, tenantId })
    })
  })

  describe('Query.incomingPayments', () => {
    let randomAsset: Asset
    const pageQuery = gql`
      query IncomingPayments(
        $filter: IncomingPaymentFilter
        $tenantId: String
      ) {
        incomingPayments(filter: $filter, tenantId: $tenantId) {
          edges {
            node {
              id
            }
          }
        }
      }
    `
    describe('page tests', () => {
      beforeEach(async (): Promise<void> => {
        randomAsset = await createAsset(deps)
        walletAddressId = (
          await createWalletAddress(deps, {
            tenantId,
            assetId: randomAsset.id
          })
        ).id
      })

      getPageTests({
        getClient: () => appContainer.apolloClient,
        createModel: () =>
          createIncomingPayment(deps, {
            walletAddressId,
            tenantId,
            initiationReason: IncomingPaymentInitiationReason.Card
          }),
        pagedQuery: 'incomingPayments'
      })

      afterEach(async (): Promise<void> => {
        await truncateTables(deps)
      })
    })
    describe('page filter tests', () => {
      let firstIncomingPayment: IncomingPaymentModel
      let secondIncomingPayment: IncomingPaymentModel

      beforeEach(async (): Promise<void> => {
        randomAsset = await createAsset(deps)
        const firstWalletAddress = await createWalletAddress(deps, {
          tenantId,
          assetId: randomAsset.id
        })
        const secondWalletAddress = await createWalletAddress(deps, {
          tenantId,
          assetId: randomAsset.id
        })

        firstIncomingPayment = await createIncomingPayment(deps, {
          walletAddressId: firstWalletAddress.id,
          tenantId: Config.operatorTenantId,
          initiationReason: IncomingPaymentInitiationReason.Admin
        })

        secondIncomingPayment = await createIncomingPayment(deps, {
          walletAddressId: secondWalletAddress.id,
          tenantId: Config.operatorTenantId,
          initiationReason: IncomingPaymentInitiationReason.Card
        })
      })

      test('can filter payments by initiatedBy', async (): Promise<void> => {
        const query = await appContainer.apolloClient
          .query({
            query: pageQuery,
            variables: {
              filter: {
                initiatedBy: {
                  in: [IncomingPaymentInitiationReason.Card]
                }
              },
              tenantId
            }
          })
          .then((query): IncomingPaymentConnection => {
            if (query.data) {
              return query.data.incomingPayments
            } else {
              throw new Error('Data was empty')
            }
          })

        expect(query.edges).toHaveLength(1)
        expect(query.edges[0].node).toMatchObject(
          expect.objectContaining({
            id: secondIncomingPayment.id
          })
        )
        expect(query.edges).not.toContainEqual(
          expect.objectContaining({
            id: firstIncomingPayment.id
          })
        )
      })

      describe('tenant boundaries', (): void => {
        let tenantPayment: IncomingPaymentModel
        let secondTenantPayment: IncomingPaymentModel
        let tenantedApolloClient: ApolloClient<NormalizedCacheObject>

        beforeEach(async (): Promise<void> => {
          const tenant = await createTenant(deps)
          tenantedApolloClient = await createApolloClient(
            appContainer.container,
            appContainer.app,
            tenant.id
          )
          const tenantWalletAddress = await createWalletAddress(deps, {
            tenantId: tenant.id
          })

          tenantPayment = await createIncomingPayment(deps, {
            walletAddressId: tenantWalletAddress.id,
            tenantId: tenant.id,
            initiationReason: IncomingPaymentInitiationReason.Card
          })

          secondTenantPayment = await createIncomingPayment(deps, {
            walletAddressId: tenantWalletAddress.id,
            tenantId: tenant.id,
            initiationReason: IncomingPaymentInitiationReason.Card
          })
        })

        test('operator can get incoming payments across all tenants', async (): Promise<void> => {
          const query = await appContainer.apolloClient
            .query({
              query: pageQuery
            })
            .then((query): IncomingPaymentConnection => {
              if (query.data) {
                return query.data.incomingPayments
              } else {
                throw new Error()
              }
            })

          expect(query.edges).toHaveLength(4)
          expect(query.edges).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                node: expect.objectContaining({
                  id: tenantPayment.id
                })
              }),
              expect.objectContaining({
                node: expect.objectContaining({
                  id: secondTenantPayment.id
                })
              }),
              expect.objectContaining({
                node: expect.objectContaining({
                  id: tenantPayment.id
                })
              }),
              expect.objectContaining({
                node: expect.objectContaining({
                  id: secondTenantPayment.id
                })
              })
            ])
          )
        })

        test('tenant cannot get incoming payments across all tenants', async (): Promise<void> => {
          const query = await tenantedApolloClient
            .query({
              query: pageQuery
            })
            .then((query): IncomingPaymentConnection => {
              if (query.data) {
                return query.data.incomingPayments
              } else {
                throw new Error()
              }
            })

          expect(query.edges).toHaveLength(2)
          expect(query.edges).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                node: expect.objectContaining({
                  id: tenantPayment.id
                })
              }),
              expect.objectContaining({
                node: expect.objectContaining({
                  id: secondTenantPayment.id
                })
              })
            ])
          )
        })

        test('operator can filter incoming payments across all tenants', async (): Promise<void> => {
          const query = await appContainer.apolloClient
            .query({
              query: pageQuery,
              variables: {
                tenantId: tenantPayment.tenantId
              }
            })
            .then((query): IncomingPaymentConnection => {
              if (query.data) {
                return query.data.incomingPayments
              } else {
                throw new Error()
              }
            })

          expect(query.edges).toHaveLength(2)
          expect(query.edges).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                node: expect.objectContaining({
                  id: tenantPayment.id
                })
              }),
              expect.objectContaining({
                node: expect.objectContaining({
                  id: secondTenantPayment.id
                })
              })
            ])
          )
        })

        test('tenant cannot filter incoming payments across all tenants', async (): Promise<void> => {
          const query = await tenantedApolloClient
            .query({
              query: pageQuery,
              variables: { tenantId: tenantPayment.tenantId }
            })
            .then((query): IncomingPaymentConnection => {
              if (query.data) {
                return query.data.incomingPayments
              } else {
                throw new Error()
              }
            })

          expect(query.edges).toHaveLength(2)
          expect(query.edges).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                node: expect.objectContaining({
                  id: tenantPayment.id
                })
              }),
              expect.objectContaining({
                node: expect.objectContaining({
                  id: secondTenantPayment.id
                })
              })
            ])
          )
        })
      })

      afterEach(async () => {
        await truncateTables(deps)
      })
    })
  })

  describe('Mutation.confirmPartialIncomingPayment', () => {
    const PARTIAL_PAYMENT_DECISION_PREFIX = 'partial_payment_decision'
    let redis: Redis
    let walletAddress: WalletAddress

    beforeEach(async (): Promise<void> => {
      redis = await deps.use('redis')
      walletAddress = await createWalletAddress(deps, {
        tenantId: Config.operatorTenantId
      })
    })

    test('can confirm a partial incoming payment', async (): Promise<void> => {
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id,
        tenantId: walletAddress.tenantId,
        initiationReason: IncomingPaymentInitiationReason.Admin
      })

      const partialIncomingPaymentId = uuid()

      const redisSpy = jest.spyOn(redis, 'set')

      const result = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation ConfirmPartialIncomingPayment(
              $input: ConfirmPartialIncomingPaymentInput!
            ) {
              confirmPartialIncomingPayment(input: $input) {
                success
              }
            }
          `,
          variables: {
            input: {
              incomingPaymentId: incomingPayment.id,
              partialIncomingPaymentId
            }
          }
        })
        .then(
          (mutation): ConfirmPartialIncomingPaymentResponse =>
            mutation.data?.confirmPartialIncomingPayment
        )

      expect(result.success).toBe(true)
      const cacheKey = `${PARTIAL_PAYMENT_DECISION_PREFIX}:${incomingPayment.id}:${partialIncomingPaymentId}`
      expect(redisSpy).toHaveBeenCalledWith(
        cacheKey,
        JSON.stringify({ success: true })
      )
    })

    test('cannot confirm partial incoming payment that does not belong to tenant', async (): Promise<void> => {
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id,
        tenantId: walletAddress.tenantId,
        initiationReason: IncomingPaymentInitiationReason.Admin
      })
      const partialIncomingPaymentId = uuid()

      const otherTenant = await createTenant(deps)
      const tenantApolloClient = await createApolloClient(
        appContainer.container,
        appContainer.app,
        otherTenant.id
      )

      const redisSpy = jest.spyOn(redis, 'set')
      expect.assertions(3)
      try {
        await tenantApolloClient.mutate({
          mutation: gql`
            mutation ConfirmPartialIncomingPayment(
              $input: ConfirmPartialIncomingPaymentInput!
            ) {
              confirmPartialIncomingPayment(input: $input) {
                success
              }
            }
          `,
          variables: {
            input: {
              incomingPaymentId: incomingPayment.id,
              partialIncomingPaymentId
            }
          }
        })
      } catch (error) {
        expect(redisSpy).not.toHaveBeenCalled()
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: errorToMessage[IncomingPaymentError.UnknownPayment],
            extensions: expect.objectContaining({
              code: GraphQLErrorCode.NotFound
            })
          })
        )
      }
    })

    test.each`
      state
      ${IncomingPaymentState.Completed}
      ${IncomingPaymentState.Expired}
    `(
      'cannot confirm partial payment for incoming payment that is $state',
      async ({ state }): Promise<void> => {
        const incomingPayment = await createIncomingPayment(deps, {
          walletAddressId: walletAddress.id,
          tenantId: walletAddress.tenantId,
          initiationReason: IncomingPaymentInitiationReason.Admin
        })
        const knex = await deps.use('knex')
        await IncomingPaymentModel.query(knex).patchAndFetchById(
          incomingPayment.id,
          { state }
        )

        const redisSpy = jest.spyOn(redis, 'set')
        expect.assertions(3)
        try {
          await appContainer.apolloClient.mutate({
            mutation: gql`
              mutation ConfirmPartialIncomingPayment(
                $input: ConfirmPartialIncomingPaymentInput!
              ) {
                confirmPartialIncomingPayment(input: $input) {
                  success
                }
              }
            `,
            variables: {
              input: {
                incomingPaymentId: incomingPayment.id,
                partialIncomingPaymentId: uuid()
              }
            }
          })
        } catch (error) {
          expect(redisSpy).not.toHaveBeenCalled()
          expect(error).toBeInstanceOf(ApolloError)
          expect((error as ApolloError).graphQLErrors).toContainEqual(
            expect.objectContaining({
              message: errorToMessage[IncomingPaymentError.InvalidState],
              extensions: expect.objectContaining({
                code: errorToCode[IncomingPaymentError.InvalidState]
              })
            })
          )
        }
      }
    )

    test('errors if redis write fails', async (): Promise<void> => {
      const redisSpy = jest.spyOn(redis, 'set').mockImplementationOnce(() => {
        throw new Error('unknown redis error')
      })

      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id,
        tenantId: walletAddress.tenantId,
        initiationReason: IncomingPaymentInitiationReason.Admin
      })
      const partialIncomingPaymentId = uuid()
      const result = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation ConfirmPartialIncomingPayment(
              $input: ConfirmPartialIncomingPaymentInput!
            ) {
              confirmPartialIncomingPayment(input: $input) {
                success
              }
            }
          `,
          variables: {
            input: {
              incomingPaymentId: incomingPayment.id,
              partialIncomingPaymentId
            }
          }
        })
        .then(
          (mutation): ConfirmPartialIncomingPaymentResponse =>
            mutation.data?.confirmPartialIncomingPayment
        )

      expect(result.success).toBe(false)
      expect(redisSpy).toHaveBeenCalledWith(
        `${PARTIAL_PAYMENT_DECISION_PREFIX}:${incomingPayment.id}:${partialIncomingPaymentId}`,
        JSON.stringify({ success: true })
      )
    })
  })
})
