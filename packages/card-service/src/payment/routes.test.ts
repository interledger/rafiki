import { PaymentTimeoutError } from './service'
import { paymentWaitMap } from './wait-map'
import { Deferred } from '../utils/deferred'
import {
  PaymentEventBody,
  PaymentBody,
  PaymentEventEnum,
  PaymentContext,
  PaymentEventContext
} from './types'
import { initIocContainer } from '../index'
import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { AppServices } from '../app'
import { IocContract } from '@adonisjs/fold'
import { PaymentRoutes } from './routes'
import { createContext } from '../tests/context'

describe('PaymentRoutes', () => {
  const url = '/payment'
  const method = 'POST'

  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let routes: PaymentRoutes

  const paymentFixture: PaymentBody = {
    requestId: 'foo',
    card: {
      walletAddress: 'wallet123',
      transactionCounter: 1,
      expiry: '2025-12-31'
    },
    merchantWalletAddress: 'merchant456',
    incomingPaymentUrl: 'https://example.com/incoming',
    date: '2024-01-01T00:00:00Z',
    signature: 'sig',
    terminalCert: 'cert',
    terminalId: 'terminal789'
  }

  const paymentEventFixture: PaymentEventBody = {
    requestId: 'foo',
    outgoingPaymentId: 'bar',
    result: { code: PaymentEventEnum.Completed }
  }

  beforeAll(async () => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    routes = await deps.use('paymentRoutes')
  })

  afterAll(async () => {
    await appContainer.shutdown()
  })

  describe('POST /payment', () => {
    test('returns 201 and result on success', async () => {
      const ctx: PaymentContext = createContext<PaymentContext>(
        { method, url },
        {},
        deps
      )
      ctx.request.body = paymentFixture

      const paymentService = await deps.use('paymentService')
      jest
        .spyOn(paymentService, 'create')
        .mockResolvedValue(paymentEventFixture)
      await expect(routes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(201)
      // expect(ctx.body as any).toEqual({ ok: true })
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
      await expect(routes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(504)
      // expect((ctx.body).error).toMatch(/Timeout/)
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
      await expect(routes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(500)
      // expect((ctx.body).error).toMatch(/fail/)
    })

    test('returns 401 and error on card expired', async () => {
      const ctx: PaymentContext = createContext<PaymentContext>(
        { method, url },
        {},
        deps
      )
      ctx.request.body = paymentFixture

      const paymentService = await deps.use('paymentService')
      jest.spyOn(paymentService, 'create').mockResolvedValue({
        ...paymentEventFixture,
        result: { code: PaymentEventEnum.CardExpired }
      })
      await expect(routes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(401)
      expect(ctx.body).toEqual({ error: 'Card expired' })
    })

    test('returns 401 and error on invalid signature', async () => {
      const ctx: PaymentContext = createContext<PaymentContext>(
        { method, url },
        {},
        deps
      )
      ctx.request.body = paymentFixture

      const paymentService = await deps.use('paymentService')
      jest.spyOn(paymentService, 'create').mockResolvedValue({
        ...paymentEventFixture,
        result: { code: PaymentEventEnum.InvalidSignature }
      })
      await expect(routes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(401)
      expect(ctx.body).toEqual({ error: 'Invalid signature' })
    })
  })

  describe('POST /payment-event', () => {
    test('returns 202 on paymentEvent with known requestId', async () => {
      const ctx: PaymentEventContext = createContext<PaymentEventContext>(
        { method, url },
        {},
        deps
      )
      ctx.request.body = paymentEventFixture

      const deferred = new Deferred<PaymentEventBody>()
      const resolveSpy = jest.spyOn(deferred, 'resolve')
      paymentWaitMap.set('foo', deferred)
      await expect(routes.paymentEvent(ctx)).resolves.toBeUndefined()
      expect(resolveSpy).toHaveBeenCalledWith(ctx.request.body)
      expect(ctx.status).toBe(202)
    })

    test('returns 404 on paymentEvent with unknown requestId', async () => {
      const ctx: PaymentEventContext = createContext<PaymentEventContext>(
        { method, url },
        {},
        deps
      )
      ctx.request.body = { ...paymentEventFixture, requestId: 'bar' }

      await expect(routes.paymentEvent(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(404)
      // expect((ctx.body).error).toMatch(/No ongoing payment/)
    })
  })
})
