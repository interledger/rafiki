import { Knex } from 'knex'
import { URL } from 'url'

import { createPaymentPointerMiddleware } from './middleware'
import { Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../'
import { AppContext, AppServices } from '../../app'
import { createTestApp, TestContainer } from '../../tests/app'
import { createContext } from '../../tests/context'
import { createPaymentPointer } from '../../tests/paymentPointer'
import { truncateTables } from '../../tests/tableManager'

type AppMiddleware = (
  ctx: AppContext,
  next: () => Promise<void>
) => Promise<void>

describe('Payment Pointer Middleware', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let middleware: AppMiddleware
  let ctx: AppContext
  let next: jest.MockedFunction<() => Promise<void>>
  let knex: Knex

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    middleware = createPaymentPointerMiddleware()
  })

  beforeEach((): void => {
    ctx = createContext(
      {
        headers: {
          Accept: 'application/json'
        }
      },
      {}
    )
    ctx.container = deps
    next = jest.fn()
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  test('returns 404 for unknown payment pointer url', async (): Promise<void> => {
    await expect(middleware(ctx, next)).rejects.toMatchObject({
      status: 404,
      message: 'Not Found'
    })
    expect(next).not.toHaveBeenCalled()
  })

  test('returns 404 for payment pointer url not matching', async (): Promise<void> => {
    await expect(middleware(ctx, next)).rejects.toMatchObject({
      status: 404,
      message: 'Not Found'
    })
    expect(next).not.toHaveBeenCalled()
  })

  test('sets the context paymentPointer and calls next', async (): Promise<void> => {
    const paymentPointer = await createPaymentPointer(deps)
    const paymentPointerUrl = new URL(paymentPointer.url)
    ctx.request.headers.host = paymentPointerUrl.host
    ctx.request.url = `${paymentPointerUrl.pathname}/endpoint`
    // Strip preceding forward slash
    ctx.params.paymentPointerPath = paymentPointerUrl.pathname.substring(1)
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(next).toHaveBeenCalled()
    expect(ctx.paymentPointer).toEqual(paymentPointer)
  })

  test('calls next for paymentPointerUrl', async (): Promise<void> => {
    const config = await deps.use('config')
    const paymentPointerUrl = new URL(config.paymentPointerUrl)
    ctx.request.headers.host = paymentPointerUrl.host
    ctx.request.url = paymentPointerUrl.pathname
    // Strip preceding forward slash
    ctx.params.paymentPointerPath = paymentPointerUrl.pathname.substring(1)
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(next).toHaveBeenCalled()
    expect(ctx.paymentPointer).toBeUndefined()
  })
})
