import jestOpenAPI from 'jest-openapi'
import { IocContract } from '@adonisjs/fold'
import { faker } from '@faker-js/faker'
import { initIocContainer } from '../../'
import { AppServices, WalletAddressContext } from '../../app'
import { Config, IAppConfig } from '../../config/app'
import { createTestApp, TestContainer } from '../../tests/app'
import { createContext } from '../../tests/context'
import { createWalletAddress } from '../../tests/walletAddress'
import { truncateTables } from '../../tests/tableManager'
import { WalletAddressRoutes } from './routes'
import { WalletAddressService } from './service'
import assert from 'assert'
import { OpenPaymentsServerRouteError } from '../route-errors'

describe('Wallet Address Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let config: IAppConfig
  let walletAddressRoutes: WalletAddressRoutes
  let walletAddressService: WalletAddressService

  beforeAll(async (): Promise<void> => {
    config = Config
    config.authServerGrantUrl = 'https://auth.wallet.example/authorize'
    deps = await initIocContainer(config)
    appContainer = await createTestApp(deps)
    const { walletAddressServerSpec } = await deps.use('openApi')
    walletAddressService = await deps.use('walletAddressService')
    jestOpenAPI(walletAddressServerSpec)
  })

  beforeEach(async (): Promise<void> => {
    config = await deps.use('config')
    walletAddressRoutes = await deps.use('walletAddressRoutes')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get', (): void => {
    test('returns 404 for nonexistent wallet address', async (): Promise<void> => {
      const ctx = createContext<WalletAddressContext>({
        headers: { Accept: 'application/json' }
      })
      jest
        .spyOn(walletAddressService, 'getOrPollByUrl')
        .mockResolvedValueOnce(undefined)

      expect.assertions(2)

      try {
        await walletAddressRoutes.get(ctx)
      } catch (err) {
        assert.ok(err instanceof OpenPaymentsServerRouteError)
        expect(err.status).toBe(404)
        expect(err.message).toBe('Could not get wallet address')
      }
    })

    test('returns 200 with an open payments wallet address', async (): Promise<void> => {
      const walletAddress = await createWalletAddress(deps, {
        publicName: faker.person.firstName()
      })

      const ctx = createContext<WalletAddressContext>({
        headers: { Accept: 'application/json' },
        url: '/'
      })
      ctx.walletAddressUrl = walletAddress.url
      await expect(walletAddressRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.body).toEqual({
        id: walletAddress.url,
        publicName: walletAddress.publicName,
        assetCode: walletAddress.asset.code,
        assetScale: walletAddress.asset.scale,
        authServer: 'https://auth.wallet.example/authorize',
        resourceServer: 'https://op.example'
      })
    })
  })
})
