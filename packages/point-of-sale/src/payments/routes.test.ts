import { IocContract } from '@adonisjs/fold'
import { v4 } from 'uuid'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { Config, IAppConfig } from '../config/app'
import { TestContainer, createTestApp } from '../tests/app'
import { PaymentContext, PaymentRoutes } from './routes'
import { truncateTables } from '../tests/tableManager'
import { PaymentService } from './service'
import { CardServiceClient, Result } from '../card-service-client/client'
import { createContext } from '../tests/context'
import { CardServiceClientError } from '../card-service-client/errors'
import { webhookWaitMap } from '../webhook-handlers/request-map'
import { faker } from '@faker-js/faker'
import { withConfigOverride } from '../tests/helpers'

describe('Payment Routes', () => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let paymentRoutes: PaymentRoutes
  let paymentService: PaymentService
  let cardServiceClient: CardServiceClient
  let config: IAppConfig

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

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
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
      expect(ctx.response.body).toBe(Result.APPROVED)
      expect(ctx.status).toBe(200)

      expect(webhookWaitMap.get('incoming-payment-url')).toBeUndefined()
    })

    test('returns 401 with result card_expired or invalid_signature', async () => {
      const ctx = createPaymentContext()
      mockPaymentService()
      jest
        .spyOn(cardServiceClient, 'sendPayment')
        .mockResolvedValueOnce(Result.CARD_EXPIRED)

      await paymentRoutes.payment(ctx)
      expect(ctx.response.body).toBe(Result.CARD_EXPIRED)
      expect(ctx.status).toBe(401)
    })

    test('returns cardService error code when thrown', async () => {
      const ctx = createPaymentContext()
      mockPaymentService()
      jest
        .spyOn(cardServiceClient, 'sendPayment')
        .mockRejectedValue(new CardServiceClientError('Some error', 404))
      await paymentRoutes.payment(ctx)
      expect(ctx.response.body).toBe('Some error')
      expect(ctx.status).toBe(404)
    })

    test('returns 400 when there is a paymentService error', async () => {
      const ctx = createPaymentContext()
      jest
        .spyOn(paymentService, 'getWalletAddress')
        .mockRejectedValueOnce(new Error('Wallet address error'))
      await paymentRoutes.payment(ctx)
      expect(ctx.response.body).toBe('Wallet address error')
      expect(ctx.status).toBe(400)
    })

    test('returns 500 when an unknown error is thrown', async () => {
      const ctx = createPaymentContext()
      jest
        .spyOn(paymentService, 'getWalletAddress')
        .mockRejectedValueOnce('Unknown error')
      await paymentRoutes.payment(ctx)
      expect(ctx.response.body).toBe('Unknown error')
      expect(ctx.status).toBe(500)
    })

    test(
      'returns 504 if incoming payment event times out',
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
          expect(ctx.response.body).toBe(
            'Timed out waiting for incoming payment event'
          )
          expect(ctx.status).toBe(504)

          expect(deleteSpy).toHaveBeenCalled()
        }
      )
    )

    function mockPaymentService() {
      jest.spyOn(paymentService, 'getWalletAddress').mockResolvedValueOnce({
        id: 'id',
        assetCode: 'USD',
        assetScale: 1,
        authServer: 'authServer',
        resourceServer: 'resourceServer',
        cardService: 'cardService'
      })
      jest
        .spyOn(paymentService, 'createIncomingPayment')
        .mockResolvedValueOnce({
          id: 'incoming-payment-url',
          url: faker.internet.url()
        })
      jest
        .spyOn(paymentService, 'getWalletAddressIdByUrl')
        .mockResolvedValueOnce(faker.internet.url())
    }
  })
})

function createPaymentContext() {
  return createContext<PaymentContext>({
    headers: { Accept: 'application/json' },
    method: 'POST',
    url: `/payment`,
    body: {
      card: {
        walletAddress: 'wallet-address',
        trasactionCounter: 0,
        expiry: new Date(new Date().getDate() + 1)
      },
      signature: 'signature',
      value: 100,
      merchantWalletAddress: 'merchant-wallet-address'
    }
  })
}
