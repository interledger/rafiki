import { PaymentTimeoutError } from './service'
import { paymentWaitMap } from './wait-map'
import { Deferred } from '../utils/deferred'
import {
  PaymentEventBody,
  PaymentBody,
  PaymentEventResultEnum,
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
  const method = 'POST'

  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let routes: PaymentRoutes

  const uuid = '123e4567-e89b-12d3-a456-426614174000'
  const uri = 'https://example.com/wallet/123'
  const dateTime = '2024-01-01T00:00:00Z'

  const paymentFixture: PaymentBody = {
    requestId: uuid,
    card: {
      walletAddress: uri,
      transactionCounter: 1,
      expiry: '12/25'
    },
    merchantWalletAddress: uri,
    incomingPaymentUrl: uri,
    date: dateTime,
    signature: 'sig',
    terminalCert: 'cert',
    terminalId: uuid
  }

  const paymentEventFixture: PaymentEventBody = {
    requestId: uuid,
    outgoingPaymentId: uuid,
    result: { code: PaymentEventResultEnum.Completed }
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
    const url = '/payment'

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
        result: { code: PaymentEventResultEnum.CardExpired }
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
        result: { code: PaymentEventResultEnum.InvalidSignature }
      })
      await expect(routes.create(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(401)
      expect(ctx.body).toEqual({ error: 'Invalid signature' })
    })
  })

  describe('POST /payment-event', () => {
    const url = '/payment-event'

    test('returns 202 on paymentEvent with known requestId', async () => {
      const ctx: PaymentEventContext = createContext<PaymentEventContext>(
        { method, url },
        {},
        deps
      )
      ctx.request.body = paymentEventFixture

      const deferred = new Deferred<PaymentEventBody>()
      const resolveSpy = jest.spyOn(deferred, 'resolve')
      paymentWaitMap.set(uuid, deferred)
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
      ctx.request.body = {
        ...paymentEventFixture,
        requestId: 'bar-uuid-0000-0000-0000-000000000000'
      }

      await expect(routes.paymentEvent(ctx)).resolves.toBeUndefined()
      expect(ctx.status).toBe(404)
      // expect((ctx.body).error).toMatch(/No ongoing payment/)
    })
  })
})
