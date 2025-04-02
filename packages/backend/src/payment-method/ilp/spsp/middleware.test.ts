import {
  createSpspMiddleware,
  SPSPRouteError,
  SPSPWalletAddressContext
} from './middleware'
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
import assert from 'assert'
import { SPSPRoutes } from './routes'
import { WalletAddressService } from '../../../open_payments/wallet_address/service'

describe('SPSP Middleware', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let spspRoutes: SPSPRoutes
  let walletAddressService: WalletAddressService
  let next: jest.MockedFunction<() => Promise<void>>

  let ctx: SPSPWalletAddressContext
  let walletAddress: WalletAddress

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    spspRoutes = await deps.use('spspRoutes')
    walletAddressService = await deps.use('walletAddressService')
  })

  beforeEach(async (): Promise<void> => {
    const asset = await createAsset(deps)
    walletAddress = await createWalletAddress(deps, {
      tenantId: Config.operatorTenantId,
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
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  test.each`
    header                      | enableSpspPaymentPointers | description
    ${'application/json'}       | ${true}                   | ${'calls next'}
    ${'application/json'}       | ${false}                  | ${'calls next'}
    ${'application/spsp4+json'} | ${true}                   | ${'calls SPSP route'}
    ${'application/spsp4+json'} | ${false}                  | ${'calls next'}
    ${'*/*'}                    | ${true}                   | ${'calls next'}
    ${'*/*'}                    | ${false}                  | ${'calls next'}
  `(
    '$description for accept header: $header and enableSpspPaymentPointers: $enableSpspPaymentPointers',
    async ({ header, enableSpspPaymentPointers }): Promise<void> => {
      const spspSpy = jest
        .spyOn(spspRoutes, 'get')
        .mockResolvedValueOnce(undefined)
      ctx.headers['accept'] = header
      const spspMiddleware = createSpspMiddleware(enableSpspPaymentPointers)
      await expect(spspMiddleware(ctx, next)).resolves.toBeUndefined()

      if (enableSpspPaymentPointers && header == 'application/spsp4+json') {
        expect(spspSpy).toHaveBeenCalledTimes(1)
        expect(next).not.toHaveBeenCalled()
        expect(ctx.paymentTag).toEqual(walletAddress.id)
        expect(ctx.asset).toEqual({
          code: walletAddress.asset.code,
          scale: walletAddress.asset.scale
        })
      } else {
        expect(spspSpy).not.toHaveBeenCalled()
        expect(next).toHaveBeenCalled()
      }
    }
  )

  test('throws error if could not find wallet address', async () => {
    const spspGetRouteSpy = jest.spyOn(spspRoutes, 'get')

    jest
      .spyOn(walletAddressService, 'getByUrl')
      .mockResolvedValueOnce(undefined)

    ctx.header['accept'] = 'application/spsp4+json'

    const spspMiddleware = createSpspMiddleware(true)

    expect.assertions(4)
    try {
      await spspMiddleware(ctx, next)
    } catch (err) {
      assert.ok(err instanceof SPSPRouteError)
      expect(err.status).toBe(404)
      expect(err.message).toBe('Could not get wallet address')
      expect(next).not.toHaveBeenCalled()
      expect(spspGetRouteSpy).not.toHaveBeenCalled()
    }
  })

  test('throws error if inactive wallet address', async () => {
    const spspGetRouteSpy = jest.spyOn(spspRoutes, 'get')

    ctx.header['accept'] = 'application/spsp4+json'

    await walletAddress
      .$query(appContainer.knex)
      .patch({ deactivatedAt: new Date() })

    const spspMiddleware = createSpspMiddleware(true)

    expect.assertions(4)
    try {
      await spspMiddleware(ctx, next)
    } catch (err) {
      assert.ok(err instanceof SPSPRouteError)
      expect(err.status).toBe(404)
      expect(err.message).toBe('Could not get wallet address')
      expect(next).not.toHaveBeenCalled()
      expect(spspGetRouteSpy).not.toHaveBeenCalled()
    }
  })
})
