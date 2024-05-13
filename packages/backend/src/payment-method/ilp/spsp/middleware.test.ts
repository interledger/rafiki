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
import { WalletAddress } from '../../../open_payments/wallet_address/model'
import { SPSPRoutes } from './routes'

describe('SPSP Middleware', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let spspRoutes: SPSPRoutes
  let next: jest.MockedFunction<() => Promise<void>>

  let ctx: SPSPWalletAddressContext
  let walletAddress: WalletAddress

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    spspRoutes = await deps.use('spspRoutes')
  })

  beforeEach(async (): Promise<void> => {
    const asset = await createAsset(deps)
    walletAddress = await createWalletAddress(deps, {
      assetId: asset.id
    })
    ctx = setup<SPSPWalletAddressContext>({
      reqOpts: {},
      walletAddress
    })
    ctx.container = deps
    next = jest.fn()
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  test.each`
    header                      | spspEnabled | description
    ${'application/json'}       | ${true}     | ${'calls next'}
    ${'application/json'}       | ${false}    | ${'calls next'}
    ${'application/spsp4+json'} | ${true}     | ${'calls SPSP route'}
    ${'application/spsp4+json'} | ${false}    | ${'calls next'}
  `(
    '$description for accept header: $header and spspEnabled: $spspEnabled',
    async ({ header, spspEnabled }): Promise<void> => {
      const spspSpy = jest
        .spyOn(spspRoutes, 'get')
        .mockResolvedValueOnce(undefined)
      ctx.headers['accept'] = header
      const spspMiddleware = createSpspMiddleware(spspEnabled)
      await expect(spspMiddleware(ctx, next)).resolves.toBeUndefined()
      if (!spspEnabled || header == 'application/json') {
        expect(spspSpy).not.toHaveBeenCalled()
        expect(next).toHaveBeenCalled()
      } else {
        expect(spspSpy).toHaveBeenCalledTimes(1)
        expect(next).not.toHaveBeenCalled()
        expect(ctx.paymentTag).toEqual(walletAddress.id)
        expect(ctx.asset).toEqual({
          code: walletAddress.asset.code,
          scale: walletAddress.asset.scale
        })
      }
    }
  )
})
