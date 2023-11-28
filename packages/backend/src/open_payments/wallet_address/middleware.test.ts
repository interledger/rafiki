import { URL } from 'url'
import { createWalletAddressMiddleware } from './middleware'
import { Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../'
import { AppContext, AppServices } from '../../app'
import { createTestApp, TestContainer } from '../../tests/app'
import { createContext } from '../../tests/context'
import { createWalletAddress } from '../../tests/walletAddress'
import { truncateTables } from '../../tests/tableManager'

type AppMiddleware = (
  ctx: AppContext,
  next: () => Promise<void>
) => Promise<void>

describe('Wallet Address Middleware', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let middleware: AppMiddleware
  let ctx: AppContext
  let next: jest.MockedFunction<() => Promise<void>>

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    middleware = createWalletAddressMiddleware()
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
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  test('returns 404 for unknown wallet address url', async (): Promise<void> => {
    await expect(middleware(ctx, next)).rejects.toMatchObject({
      status: 404,
      message: 'Not Found'
    })
    expect(next).not.toHaveBeenCalled()
  })

  test('returns 404 for wallet address url not matching', async (): Promise<void> => {
    await expect(middleware(ctx, next)).rejects.toMatchObject({
      status: 404,
      message: 'Not Found'
    })
    expect(next).not.toHaveBeenCalled()
  })

  test('sets the context walletAddress and calls next', async (): Promise<void> => {
    const walletAddress = await createWalletAddress(deps)
    const walletAddressUrl = new URL(walletAddress.url)
    ctx.request.headers.host = walletAddressUrl.host
    ctx.request.url = `${walletAddressUrl.pathname}/endpoint`
    // Strip preceding forward slash
    ctx.params.walletAddressPath = walletAddressUrl.pathname.substring(1)
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(next).toHaveBeenCalled()
    expect(ctx.walletAddress).toEqual(walletAddress)
  })

  test('calls next for walletAddressUrl', async (): Promise<void> => {
    const config = await deps.use('config')
    const walletAddressUrl = new URL(config.walletAddressUrl)
    ctx.request.headers.host = walletAddressUrl.host
    ctx.request.url = walletAddressUrl.pathname
    // Strip preceding forward slash
    ctx.params.walletAddressPath = walletAddressUrl.pathname.substring(1)
    await expect(middleware(ctx, next)).resolves.toBeUndefined()
    expect(next).toHaveBeenCalled()
    expect(ctx.walletAddress).toBeUndefined()
  })

  test('returns 404 for deactivated wallet address', async (): Promise<void> => {
    const walletAddress = await createWalletAddress(deps)

    const deactivatedAt = new Date()
    deactivatedAt.setDate(deactivatedAt.getDate() - 1)
    await walletAddress
      .$query(appContainer.knex)
      .patch({ deactivatedAt: new Date() })

    const walletAddressUrl = new URL(walletAddress.url)
    ctx.request.headers.host = walletAddressUrl.host
    ctx.request.url = `${walletAddressUrl.pathname}/endpoint`
    // Strip preceding forward slash
    ctx.params.walletAddressPath = walletAddressUrl.pathname.substring(1)

    await expect(middleware(ctx, next)).rejects.toMatchObject({
      status: 404,
      message: 'Not Found'
    })
    expect(next).not.toHaveBeenCalled()
  })
})
