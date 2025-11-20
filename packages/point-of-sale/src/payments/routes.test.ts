import { IocContract } from '@adonisjs/fold'
import { v4 } from 'uuid'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { Config, IAppConfig } from '../config/app'
import { TestContainer, createTestApp } from '../tests/app'
import {
  GetPaymentsContext,
  GetPaymentsQuery,
  PaymentContext,
  PaymentRoutes,
  RefundContext
} from './routes'
import { PaymentService } from './service'
import { CardServiceClient, Result } from '../card-service-client/client'
import { createContext } from '../tests/context'
import { CardServiceClientError } from '../card-service-client/errors'
import { webhookWaitMap } from '../webhook-handlers/request-map'
import { faker } from '@faker-js/faker'
import { withConfigOverride } from '../tests/helpers'
import { IncomingPaymentState, SortOrder } from '../graphql/generated/graphql'

describe('Payment Routes', () => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let paymentRoutes: PaymentRoutes
  let paymentService: PaymentService
  let cardServiceClient: CardServiceClient
  let config: IAppConfig

  function mockPaymentService() {
    const getWalletAddressSpy = jest
      .spyOn(paymentService, 'getWalletAddress')
      .mockResolvedValueOnce({
        id: 'id',
        assetCode: 'USD',
        assetScale: 1,
        authServer: 'authServer',
        resourceServer: 'resourceServer',
        cardService: 'cardService'
      })

    const createIncomingPaymentSpy = jest
      .spyOn(paymentService, 'createIncomingPayment')
      .mockResolvedValueOnce({
        id: 'incoming-payment-url',
        url: faker.internet.url()
      })

    const getWalletAddressIdByUrlSpy = jest
      .spyOn(paymentService, 'getWalletAddressIdByUrl')
      .mockResolvedValueOnce(faker.internet.url())

    return {
      getWalletAddressSpy,
      createIncomingPaymentSpy,
      getWalletAddressIdByUrlSpy
    }
  }

  beforeAll(async () => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    paymentService = await deps.use('paymentClient')
    cardServiceClient = await deps.use('cardServiceClient')
    paymentRoutes = await deps.use('paymentRoutes')
    config = await deps.use('config')
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('payment', () => {
    test('returns 200 with result approved', async () => {
      const ctx = createPaymentContext()
      mockPaymentService()
      jest
        .spyOn(cardServiceClient, 'sendPayment')
        .mockResolvedValueOnce(Result.APPROVED)

      jest
        .spyOn(webhookWaitMap, 'setWithExpiry')
        .mockImplementationOnce((key, deferred) => {
          deferred.resolve({
            id: v4(),
            type: 'incoming_payment.completed',
            data: { id: key, completed: true }
          })
          return webhookWaitMap
        })

      await paymentRoutes.payment(ctx)
      expect(ctx.response.body).toEqual({ result: { code: Result.APPROVED } })
      expect(ctx.status).toBe(200)

      expect(webhookWaitMap.get('incoming-payment-url')).toBeUndefined()
    })

    test('returns 200 with invalid_signature result when card service returns invalid signature', async () => {
      const ctx = createPaymentContext()
      mockPaymentService()
      jest
        .spyOn(cardServiceClient, 'sendPayment')
        .mockResolvedValueOnce(Result.INVALID_SIGNATURE)
      await paymentRoutes.payment(ctx)
      expect(ctx.response.body).toEqual({
        result: { code: Result.INVALID_SIGNATURE }
      })
      expect(ctx.status).toBe(200)
    })

    test('returns 400 invalid_request body when an error is thrown', async () => {
      const ctx = createPaymentContext()
      mockPaymentService()
      jest
        .spyOn(cardServiceClient, 'sendPayment')
        .mockRejectedValue(new CardServiceClientError('Some error', 404))
      await paymentRoutes.payment(ctx)
      expect(ctx.response.body).toEqual({ error: { code: 'invalid_request' } })
      expect(ctx.status).toBe(400)
    })

    test('returns 400 when there is a paymentService error', async () => {
      const ctx = createPaymentContext()
      jest
        .spyOn(paymentService, 'getWalletAddress')
        .mockRejectedValueOnce(new Error('Wallet address error'))
      await paymentRoutes.payment(ctx)
      expect(ctx.response.body).toEqual({ error: { code: 'invalid_request' } })
      expect(ctx.status).toBe(400)
    })

    test('returns 400 when an unknown error is thrown', async () => {
      const ctx = createPaymentContext()
      jest
        .spyOn(paymentService, 'getWalletAddress')
        .mockRejectedValueOnce('Unknown error')
      await paymentRoutes.payment(ctx)
      expect(ctx.response.body).toEqual({ error: { code: 'invalid_request' } })
      expect(ctx.status).toBe(400)
    })

    test(
      'returns 400 if incoming payment event times out',
      withConfigOverride(
        () => config,
        { webhookTimeoutMs: 1 },
        async (): Promise<void> => {
          jest
            .spyOn(webhookWaitMap, 'setWithExpiry')
            .mockImplementationOnce(() => {
              return webhookWaitMap
            })
          const deleteSpy = jest.spyOn(webhookWaitMap, 'delete')
          const ctx = createPaymentContext()
          mockPaymentService()
          jest
            .spyOn(cardServiceClient, 'sendPayment')
            .mockResolvedValueOnce(Result.APPROVED)
          await paymentRoutes.payment(ctx)
          expect(ctx.response.body).toEqual({
            error: { code: 'invalid_request' }
          })
          expect(ctx.status).toBe(400)

          expect(deleteSpy).toHaveBeenCalled()
        }
      )
    )

    test(
      'falls back to http for payment request if configured',
      withConfigOverride(
        () => config,
        { useHttp: true },
        async () => {
          const senderWalletAddress = 'https://example.com/'

          const ctx = createPaymentContext({ senderWalletAddress })

          const { getWalletAddressSpy } = mockPaymentService()
          jest
            .spyOn(cardServiceClient, 'sendPayment')
            .mockResolvedValueOnce(Result.APPROVED)

          jest
            .spyOn(webhookWaitMap, 'setWithExpiry')
            .mockImplementationOnce((key, deferred) => {
              deferred.resolve({
                id: v4(),
                type: 'incoming_payment.completed',
                data: { id: key, completed: true }
              })
              return webhookWaitMap
            })

          await paymentRoutes.payment(ctx)
          expect(getWalletAddressSpy).toHaveBeenCalledWith(
            'http://example.com/'
          )
          expect(ctx.response.body).toEqual({
            result: { code: Result.APPROVED }
          })
          expect(ctx.status).toBe(200)
        }
      )
    )
  })

  describe('get incoming payments', (): void => {
    test('can get incoming payments for pos device', async (): Promise<void> => {
      const walletAddressId = v4()
      const mockServiceResponse = {
        edges: [
          {
            node: {
              __typename: 'IncomingPayment' as const,
              id: v4(),
              url: faker.internet.url(),
              walletAddressId,
              client: faker.internet.url(),
              state: IncomingPaymentState.Pending,
              incomingAmount: {
                __typename: 'Amount' as const,
                value: BigInt(500),
                assetCode: 'USD',
                assetScale: 2
              },
              receivedAmount: {
                __typename: 'Amount' as const,
                value: BigInt(500),
                assetCode: 'USD',
                assetScale: 2
              },
              expiresAt: new Date().toString(),
              createdAt: new Date().toString(),
              tenantId: v4(),
              initiatedBy: 'CARD'
            },
            cursor: walletAddressId
          }
        ],
        pageInfo: {
          endCursor: walletAddressId,
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: walletAddressId
        }
      }
      const getIncomingPaymentsSpy = jest
        .spyOn(paymentService, 'getIncomingPayments')
        .mockResolvedValue(mockServiceResponse)
      const ctx = createGetPaymentsContext()

      await paymentRoutes.getPayments(ctx)
      expect(ctx.status).toEqual(200)
      expect(ctx.body).toEqual({
        // Ensure that typename is sanitized
        result: mockServiceResponse.edges.map((edge) => {
          const {
            __typename: _nodeTypename,
            receivedAmount,
            incomingAmount,
            ...restOfNode
          } = edge.node
          const { __typename: _receivedTypename, ...restOfReceived } =
            receivedAmount
          const { __typename: _incomingTypename, ...restOfIncoming } =
            incomingAmount
          return {
            ...restOfNode,
            incomingAmount: restOfIncoming,
            receivedAmount: restOfReceived
          }
        }),
        pagination: mockServiceResponse.pageInfo
      })

      expect(getIncomingPaymentsSpy).toHaveBeenCalledWith({
        receiverWalletAddress: ctx.query.receiverWalletAddress,
        filter: {
          initiatedBy: {
            in: ['CARD']
          }
        }
      })
    })

    test('returns empty page if no incoming payments', async (): Promise<void> => {
      jest
        .spyOn(paymentService, 'getIncomingPayments')
        .mockResolvedValue(undefined)

      const ctx = createGetPaymentsContext()

      await paymentRoutes.getPayments(ctx)
      expect(ctx.status).toEqual(200)
      expect(ctx.body).toMatchObject({
        result: [],
        pagination: {
          hasNextPage: false,
          hasPreviousPage: false
        }
      })
    })

    test('passes through pagination filters', async (): Promise<void> => {
      const beforeWalletAddressId = v4()
      const afterWalletAddressId = v4()
      const walletAddressId = v4()
      const mockServiceResponse = {
        edges: [
          {
            node: {
              __typename: 'IncomingPayment' as const,
              id: v4(),
              url: faker.internet.url(),
              walletAddressId,
              client: faker.internet.url(),
              state: IncomingPaymentState.Pending,
              incomingAmount: {
                __typename: 'Amount' as const,
                value: BigInt(500),
                assetCode: 'USD',
                assetScale: 2
              },
              receivedAmount: {
                __typename: 'Amount' as const,
                value: BigInt(500),
                assetCode: 'USD',
                assetScale: 2
              },
              expiresAt: new Date().toString(),
              createdAt: new Date().toString(),
              tenantId: v4(),
              initiatedBy: 'CARD'
            },
            cursor: walletAddressId
          }
        ],
        pageInfo: {
          endCursor: afterWalletAddressId,
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: beforeWalletAddressId
        }
      }
      const getIncomingPaymentsSpy = jest
        .spyOn(paymentService, 'getIncomingPayments')
        .mockResolvedValue(mockServiceResponse)
      const ctx = createGetPaymentsContext({
        sortOrder: SortOrder.Asc,
        first: 1,
        last: 1,
        before: beforeWalletAddressId,
        after: afterWalletAddressId
      })

      await paymentRoutes.getPayments(ctx)
      expect(getIncomingPaymentsSpy).toHaveBeenCalledWith({
        receiverWalletAddress: ctx.query.receiverWalletAddress,
        sortOrder: SortOrder.Asc,
        first: 1,
        last: 1,
        before: beforeWalletAddressId,
        after: afterWalletAddressId,
        filter: {
          initiatedBy: {
            in: ['CARD']
          }
        }
      })
    })
  })

  describe('refund payment', () => {
    test('returns 200 when refunding incoming payment', async (): Promise<void> => {
      const ctx = createRefundContext()
      jest
        .spyOn(paymentService, 'refundIncomingPayment')
        .mockResolvedValueOnce({
          id: v4()
        })

      await paymentRoutes.refundPayment(ctx)
      expect(ctx.status).toEqual(200)
    })

    test('returns 400 if incoming payment refund fails', async (): Promise<void> => {
      const ctx = createRefundContext()
      const refundError = new Error('Failed to refund incoming payment')
      jest
        .spyOn(paymentService, 'refundIncomingPayment')
        .mockRejectedValueOnce(refundError)

      await paymentRoutes.refundPayment(ctx)
      expect(ctx.status).toEqual(400)
      expect(ctx.body).toEqual(refundError.message)
    })
  })
})

function createPaymentContext(bodyOverrides?: Record<string, unknown>) {
  return createContext<PaymentContext>({
    headers: { Accept: 'application/json' },
    method: 'POST',
    url: `/payment`,
    body: {
      signature: 'signature',
      payload: 'payload',
      receiverWalletAddress: faker.internet.url(),
      senderWalletAddress: faker.internet.url(),
      timestamp: new Date().getTime(),
      amount: { assetScale: 2, assetCode: 'USD', value: '100' },
      ...bodyOverrides
    }
  })
}

function createGetPaymentsContext(
  options?: Omit<GetPaymentsQuery, 'receiverWalletAddress'>
) {
  const query = {
    receiverWalletAddress: faker.internet.url(),
    ...options
  }
  if (options?.first) {
    Object.assign(query, { first: String(options.first) })
  }

  if (options?.last) {
    Object.assign(query, { last: String(options.last) })
  }
  return createContext<GetPaymentsContext>({
    headers: { Accept: 'application/json' },
    method: 'GET',
    url: `/payments`,
    query
  })
}

function createRefundContext() {
  return createContext<RefundContext>({
    headers: { Accept: 'application/json' },
    method: 'POST',
    url: '/refund',
    body: {
      incomingPaymentId: v4(),
      posWalletAddress: faker.internet.url()
    }
  })
}
