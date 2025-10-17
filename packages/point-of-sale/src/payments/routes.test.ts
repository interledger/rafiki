import { IocContract } from '@adonisjs/fold'
import { v4 } from 'uuid'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { Config, IAppConfig } from '../config/app'
import { TestContainer, createTestApp } from '../tests/app'
import { GetPaymentsContext, PaymentContext, PaymentRoutes } from './routes'
import { PaymentService } from './service'
import { CardServiceClient, Result } from '../card-service-client/client'
import { createContext } from '../tests/context'
import { CardServiceClientError } from '../card-service-client/errors'
import { webhookWaitMap } from '../webhook-handlers/request-map'
import { faker } from '@faker-js/faker'
import { withConfigOverride } from '../tests/helpers'
import { IncomingPaymentState } from '../graphql/generated/graphql'

describe('Payment Routes', () => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let paymentRoutes: PaymentRoutes
  let paymentService: PaymentService
  let cardServiceClient: CardServiceClient
  let config: IAppConfig

  function mockPaymentService() {
    jest.spyOn(paymentService, 'getWalletAddress').mockResolvedValueOnce({
      id: 'id',
      assetCode: 'USD',
      assetScale: 1,
      authServer: 'authServer',
      resourceServer: 'resourceServer',
      cardService: 'cardService'
    })
    jest.spyOn(paymentService, 'createIncomingPayment').mockResolvedValueOnce({
      id: 'incoming-payment-url',
      url: faker.internet.url()
    })
    jest
      .spyOn(paymentService, 'getWalletAddressIdByUrl')
      .mockResolvedValueOnce(faker.internet.url())
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
  })

  describe('get incoming payments', (): void => {
    test('can get incoming payments for pos device', async (): Promise<void> => {
      const walletAddressId = v4()
      const mockServiceResponse = {
        edges: [
          {
            node: {
              id: v4(),
              url: faker.internet.url(),
              walletAddressId,
              client: faker.internet.url(),
              state: IncomingPaymentState.Pending,
              incomingAmount: {
                value: BigInt(500),
                assetCode: 'USD',
                assetScale: 2
              },
              receivedAmount: {
                value: BigInt(500),
                assetCode: 'USD',
                assetScale: 2
              },
              expiresAt: new Date().toString(),
              createdAt: new Date().toString(),
              tenantId: v4()
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
      jest
        .spyOn(paymentService, 'getIncomingPayments')
        .mockResolvedValue(mockServiceResponse)
      const ctx = createGetPaymentsContext()

      await paymentRoutes.getPayments(ctx)
      expect(ctx.status).toEqual(200)
      expect(ctx.body).toEqual(mockServiceResponse)
    })
  })
})

function createPaymentContext() {
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
      amount: { assetScale: 2, assetCode: 'USD', value: '100' }
    }
  })
}

function createGetPaymentsContext() {
  return createContext<GetPaymentsContext>({
    headers: { Accept: 'application/json' },
    method: 'GET',
    url: `/payments`,
    query: {
      receiverWalletAddress: faker.internet.url()
    }
  })
}
