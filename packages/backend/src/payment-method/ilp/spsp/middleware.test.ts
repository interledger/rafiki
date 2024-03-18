import { createSpspMiddleware, SPSPWalletAddressContext } from './middleware'
import { setup } from '../../../open_payments/wallet_address/model.test'
import { Config } from '../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import { AppServices } from '../../../app'
import { createTestApp, TestContainer } from '../../../tests/app'
import { createAsset } from '../../../tests/asset'
import { createWalletAddress } from '../../../tests/walletAddress'
import { truncateTables } from '../../../tests/tableManager'

describe('SPSP Middleware', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let next: jest.MockedFunction<() => Promise<void>>
  let spspMiddleware: (
    ctx: SPSPWalletAddressContext,
    next: () => Promise<unknown>
  ) => Promise<void>

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
  })

  beforeEach((): void => {
    next = jest.fn()
    spspMiddleware = createSpspMiddleware(true)
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Wallet Address', (): void => {
    let ctx: SPSPWalletAddressContext

    beforeEach(async (): Promise<void> => {
      const asset = await createAsset(deps)
      const walletAddress = await createWalletAddress(deps, {
        assetId: asset.id
      })
      ctx = setup<SPSPWalletAddressContext>({
        reqOpts: {},
        walletAddress
      })
      ctx.container = deps
    })

    test('calls next for non-SPSP request', async (): Promise<void> => {
      const spspRoutes = await ctx.container.use('spspRoutes')
      const spspSpy = jest.spyOn(spspRoutes, 'get')
      ctx.headers['accept'] = 'application/json'
      await expect(spspMiddleware(ctx, next)).resolves.toBeUndefined()
      expect(spspSpy).not.toHaveBeenCalled()
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
      expect(ctx.paymentTag).toEqual(ctx.walletAddress.id)
      expect(ctx.asset).toEqual({
        code: ctx.walletAddress.asset.code,
        scale: ctx.walletAddress.asset.scale
      })
    })
  })
})
