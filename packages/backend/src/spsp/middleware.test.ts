import {
  spspMiddleware,
  SPSPConnectionContext,
  SPSPPaymentPointerContext
} from './middleware'
import { setup } from '../open_payments/payment_pointer/model.test'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { createTestApp, TestContainer } from '../tests/app'
import { createAsset } from '../tests/asset'
import { createContext } from '../tests/context'
import { createIncomingPayment } from '../tests/incomingPayment'
import { createPaymentPointer } from '../tests/paymentPointer'
import { truncateTables } from '../tests/tableManager'

describe('SPSP Middleware', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let next: jest.MockedFunction<() => Promise<void>>

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
  })

  beforeEach((): void => {
    next = jest.fn()
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Payment Pointer', (): void => {
    let ctx: SPSPPaymentPointerContext

    beforeEach(async (): Promise<void> => {
      const asset = await createAsset(deps)
      const paymentPointer = await createPaymentPointer(deps, {
        assetId: asset.id
      })
      ctx = setup<SPSPPaymentPointerContext>({
        reqOpts: {},
        paymentPointer
      })
      ctx.container = deps
    })

    test('calls next for non-SPSP request', async (): Promise<void> => {
      await expect(spspMiddleware(ctx, next)).resolves.toBeUndefined()
      expect(next).toHaveBeenCalled()
    })

    test('calls SPSP route for SPSP query', async (): Promise<void> => {
      const spspRoutes = await ctx.container.use('spspRoutes')
      const spspSpy = jest
        .spyOn(spspRoutes, 'get')
        .mockResolvedValueOnce(undefined)

      ctx.headers['accept'] = 'application/spsp4+json'
      await expect(spspMiddleware(ctx, next)).resolves.toBeUndefined()
      expect(spspSpy).toHaveBeenCalledTimes(1)
      expect(next).not.toHaveBeenCalled()
      expect(ctx.paymentTag).toEqual(ctx.paymentPointer.id)
      expect(ctx.asset).toEqual({
        code: ctx.paymentPointer.asset.code,
        scale: ctx.paymentPointer.asset.scale
      })
    })
  })

  describe('Incoming Payment Connection', (): void => {
    let ctx: SPSPConnectionContext

    beforeEach(async (): Promise<void> => {
      ctx = createContext<SPSPConnectionContext>(
        {
          headers: {
            Accept: 'application/json'
          }
        },
        {}
      )
      const asset = await createAsset(deps)
      const { id: paymentPointerId } = await createPaymentPointer(deps, {
        assetId: asset.id
      })
      const incomingPayment = await createIncomingPayment(deps, {
        paymentPointerId
      })
      ctx.incomingPayment = incomingPayment
      ctx.container = deps
    })

    test('calls next for non-SPSP request', async (): Promise<void> => {
      await expect(spspMiddleware(ctx, next)).resolves.toBeUndefined()
      expect(next).toHaveBeenCalled()
    })

    test('calls SPSP route for SPSP query', async (): Promise<void> => {
      const spspRoutes = await ctx.container.use('spspRoutes')
      const spspSpy = jest
        .spyOn(spspRoutes, 'get')
        .mockResolvedValueOnce(undefined)

      ctx.headers['accept'] = 'application/spsp4+json'
      await expect(spspMiddleware(ctx, next)).resolves.toBeUndefined()
      expect(spspSpy).toHaveBeenCalledTimes(1)
      expect(next).not.toHaveBeenCalled()
      expect(ctx.paymentTag).toEqual(ctx.incomingPayment.id)
      expect(ctx.asset).toEqual({
        code: ctx.incomingPayment.asset.code,
        scale: ctx.incomingPayment.asset.scale
      })
    })
  })
})
