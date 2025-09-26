import { paymentWaitMap } from './wait-map'
import { Deferred } from '../utils/deferred'
import {
  PaymentEventBody,
  PaymentBody,
  PaymentEventType,
  PaymentCancellationReason,
  PaymentContext,
  PaymentEventContext,
  PaymentResult,
  PaymentResultCode,
  PaymentErrorCode
} from './types'
import { initIocContainer } from '../index'
import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { AppServices } from '../app'
import { IocContract } from '@adonisjs/fold'
import { PaymentRoutes } from './routes'
import { createContext } from '../tests/context'
import { PaymentTimeoutError } from './errors'

describe('PaymentRoutes', () => {
  const method = 'POST'

  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let routes: PaymentRoutes

  const requestId = '123e4567-e89b-12d3-a456-426614174000'

  const paymentFixture: PaymentBody = {
    requestId,
    senderWalletAddress: 'https://example.com/wallet/123',
    signature: 'sig',
    payload: 'payload',
    incomingPaymentUrl: 'https://example.com/incoming-payment/123',
    timestamp: new Date().getTime(),
    amount: {
      assetCode: 'USD',
      assetScale: 0,
      value: '100'
    }
  }

  const paymentEventFixture: PaymentEventBody = {
    id: crypto.randomUUID(),
    type: PaymentEventType.Funded,
    data: {
      id: crypto.randomUUID(),
      cardDetails: {
        requestId
      },
      metadata: {}
    }
  }

  beforeAll(async () => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    routes = await deps.use('paymentRoutes')
  })

  afterEach(() => {
    paymentWaitMap.clear()
  })

  afterAll(async () => {
    await appContainer.shutdown()
  })

  describe('POST /payment', () => {
    const url = '/payment'

    test('returns 201 and result on success', async () => {
      const ctx: PaymentContext = createContext<PaymentContext>(
        { method, url },
        {},
        deps
      )
      ctx.request.body = paymentFixture

      const paymentService = await deps.use('paymentService')
      jest.spyOn(paymentService, 'create').mockResolvedValue({
        requestId,
        result: { code: PaymentResultCode.Approved }
      })
      await expect(routes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(201)
      expect(ctx.body).toEqual({
        requestId,
        result: { code: PaymentResultCode.Approved }
      })
    })

    test('returns 504 on PaymentTimeoutError', async () => {
      const ctx: PaymentContext = createContext<PaymentContext>(
        { method, url },
        {},
        deps
      )
      ctx.request.body = paymentFixture

      const paymentService = await deps.use('paymentService')
      jest
        .spyOn(paymentService, 'create')
        .mockRejectedValue(new PaymentTimeoutError())

      await expect(routes.create(ctx)).rejects.toMatchObject({
        status: 504,
        message: 'Timeout waiting for payment-event'
      })
    })

    test('returns 500 on unknown error', async () => {
      const ctx: PaymentContext = createContext<PaymentContext>(
        { method, url },
        {},
        deps
      )
      ctx.request.body = paymentFixture

      const paymentService = await deps.use('paymentService')
      jest.spyOn(paymentService, 'create').mockRejectedValue(new Error('fail'))

      await expect(routes.create(ctx)).rejects.toMatchObject({
        status: 500,
        message: 'fail'
      })
    })

    test('returns 201 and invalid signature result when webhook reports invalid signature', async () => {
      const ctx: PaymentContext = createContext<PaymentContext>(
        { method, url },
        {},
        deps
      )
      ctx.request.body = paymentFixture

      const paymentService = await deps.use('paymentService')
      jest.spyOn(paymentService, 'create').mockResolvedValue({
        requestId,
        result: {
          code: PaymentResultCode.InvalidSignature,
          description: 'Invalid card signature'
        }
      })

      await expect(routes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(201)
      expect(ctx.body).toEqual({
        requestId,
        result: {
          code: PaymentResultCode.InvalidSignature,
          description: 'Invalid card signature'
        }
      })
    })

    test('returns 400 with invalid_request error when service reports request issue', async () => {
      const ctx: PaymentContext = createContext<PaymentContext>(
        { method, url },
        {},
        deps
      )
      ctx.request.body = paymentFixture

      const paymentService = await deps.use('paymentService')
      jest.spyOn(paymentService, 'create').mockResolvedValue({
        error: {
          code: PaymentErrorCode.InvalidRequest,
          description: 'Unsupported payment event type'
        }
      })

      await expect(routes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(400)
      expect(ctx.body).toEqual({
        error: {
          code: PaymentErrorCode.InvalidRequest,
          description: 'Unsupported payment event type'
        }
      })
    })
  })

  describe('POST /payment-event', () => {
    const url = '/payment-event'

    test('returns 200 on paymentEvent with known requestId', async () => {
      const ctx: PaymentEventContext = createContext<PaymentEventContext>(
        { method, url },
        {},
        deps
      )
      ctx.request.body = paymentEventFixture

      const deferred = new Deferred<PaymentResult>()
      const resolveSpy = jest.spyOn(deferred, 'resolve')
      paymentWaitMap.set(requestId, deferred)
      await expect(routes.handlePaymentEvent(ctx)).resolves.toBeUndefined()
      expect(resolveSpy).toHaveBeenCalledWith({
        requestId,
        result: { code: PaymentResultCode.Approved }
      })
      expect(ctx.status).toBe(200)
    })

    test('resolves invalid signature result on cancelled payment with invalid signature reason', async () => {
      const ctx: PaymentEventContext = createContext<PaymentEventContext>(
        { method, url },
        {},
        deps
      )
      ctx.request.body = {
        ...paymentEventFixture,
        type: PaymentEventType.Cancelled,
        data: {
          ...paymentEventFixture.data,
          metadata: {
            ...paymentEventFixture.data.metadata,
            cardPaymentFailureReason: PaymentCancellationReason.InvalidSignature
          }
        }
      }

      const deferred = new Deferred<PaymentResult>()
      const resolveSpy = jest.spyOn(deferred, 'resolve')
      paymentWaitMap.set(requestId, deferred)
      await expect(routes.handlePaymentEvent(ctx)).resolves.toBeUndefined()
      expect(resolveSpy).toHaveBeenCalledWith({
        requestId,
        result: {
          code: PaymentResultCode.InvalidSignature,
          description: 'Invalid card signature'
        }
      })
      expect(ctx.status).toBe(200)
    })

    test('resolves invalid_request error on cancelled payment with invalid request reason', async () => {
      const ctx: PaymentEventContext = createContext<PaymentEventContext>(
        { method, url },
        {},
        deps
      )
      ctx.request.body = {
        ...paymentEventFixture,
        type: PaymentEventType.Cancelled,
        data: {
          ...paymentEventFixture.data,
          metadata: {
            ...paymentEventFixture.data.metadata,
            cardPaymentFailureReason: PaymentCancellationReason.InvalidRequest
          }
        }
      }

      const deferred = new Deferred<PaymentResult>()
      const resolveSpy = jest.spyOn(deferred, 'resolve')
      paymentWaitMap.set(requestId, deferred)
      await expect(routes.handlePaymentEvent(ctx)).resolves.toBeUndefined()
      expect(resolveSpy).toHaveBeenCalledWith({
        error: {
          code: PaymentErrorCode.InvalidRequest,
          description: expect.stringContaining('invalid_request')
        }
      })
      expect(ctx.status).toBe(200)
    })

    test('resolves invalid_request error on cancelled payment with unsupported reason', async () => {
      const ctx: PaymentEventContext = createContext<PaymentEventContext>(
        { method, url },
        {},
        deps
      )
      ctx.request.body = {
        ...paymentEventFixture,
        type: PaymentEventType.Cancelled,
        data: {
          ...paymentEventFixture.data,
          metadata: {
            ...paymentEventFixture.data.metadata,
            cardPaymentFailureReason: 'mismatched_hash'
          }
        }
      }

      const deferred = new Deferred<PaymentResult>()
      const resolveSpy = jest.spyOn(deferred, 'resolve')
      paymentWaitMap.set(requestId, deferred)
      await expect(routes.handlePaymentEvent(ctx)).resolves.toBeUndefined()
      expect(resolveSpy).toHaveBeenCalledWith({
        error: {
          code: PaymentErrorCode.InvalidRequest,
          description: expect.stringContaining('mismatched_hash')
        }
      })
      expect(ctx.status).toBe(200)
    })

    test('returns 200 without resolving when requestId is unknown', async () => {
      const ctx: PaymentEventContext = createContext<PaymentEventContext>(
        { method, url },
        {},
        deps
      )
      ctx.request.body = {
        ...paymentEventFixture,
        data: {
          ...paymentEventFixture.data,
          cardDetails: {
            ...paymentEventFixture.data.cardDetails,
            requestId
          }
        }
      }

      await expect(routes.handlePaymentEvent(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(200)
      expect(paymentWaitMap.size).toBe(0)
    })
  })
})
