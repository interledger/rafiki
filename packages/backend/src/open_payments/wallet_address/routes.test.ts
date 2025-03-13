import jestOpenAPI from 'jest-openapi'
import { IocContract } from '@adonisjs/fold'
import { faker } from '@faker-js/faker'
import { initIocContainer } from '../../'
import { AppServices, WalletAddressUrlContext } from '../../app'
import { Config, IAppConfig } from '../../config/app'
import { createTestApp, TestContainer } from '../../tests/app'
import { createContext } from '../../tests/context'
import { createWalletAddress } from '../../tests/walletAddress'
import { truncateTables } from '../../tests/tableManager'
import { WalletAddressRoutes } from './routes'
import assert from 'assert'
import { OpenPaymentsServerRouteError } from '../route-errors'
import { WalletAddressService } from './service'
import { WalletAddressAdditionalProperty } from './additional_property/model'

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
    jestOpenAPI(walletAddressServerSpec)
    config = await deps.use('config')
    walletAddressRoutes = await deps.use('walletAddressRoutes')
    walletAddressService = await deps.use('walletAddressService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get', (): void => {
    test('throws 404 error for nonexistent wallet address', async (): Promise<void> => {
      const ctx = createContext<WalletAddressUrlContext>({
        headers: { Accept: 'application/json' }
      })
      jest
        .spyOn(walletAddressService, 'getOrPollByUrl')
        .mockResolvedValueOnce(undefined)

      expect.assertions(2)
      try {
        await walletAddressRoutes.get(ctx)
      } catch (err) {
        assert(err instanceof OpenPaymentsServerRouteError)
        expect(err.status).toBe(404)
        expect(err.message).toBe('Could not get wallet address')
      }
    })

    test('throws 404 error for inactive wallet address', async (): Promise<void> => {
      const walletAddress = await createWalletAddress(deps, {
        tenantId: Config.operatorTenantId,
        publicName: faker.person.firstName()
      })

      await walletAddress.$query().patch({ deactivatedAt: new Date() })

      const ctx = createContext<WalletAddressUrlContext>({
        headers: { Accept: 'application/json' }
      })
      ctx.walletAddressUrl = walletAddress.address

      const getOrPollByUrlSpy = jest.spyOn(
        walletAddressService,
        'getOrPollByUrl'
      )

      expect.assertions(3)
      try {
        await walletAddressRoutes.get(ctx)
      } catch (err) {
        assert(err instanceof OpenPaymentsServerRouteError)
        expect(err.status).toBe(404)
        expect(err.message).toBe('Could not get wallet address')
        await expect(getOrPollByUrlSpy.mock.results[0].value).resolves.toEqual(
          walletAddress
        )
      }
    })

    test('store and fetch additional properties for a wallet', async (): Promise<void> => {
      const addProp = new WalletAddressAdditionalProperty()
      addProp.fieldKey = 'field-key-open-pay'
      addProp.fieldValue = 'field-val-open-pay'
      addProp.visibleInOpenPayments = true

      const addPropNotVisibleInOpenPayments =
        new WalletAddressAdditionalProperty()
      addPropNotVisibleInOpenPayments.fieldKey = 'not-visible-in-op'
      addPropNotVisibleInOpenPayments.fieldValue = 'it-is-not'
      addPropNotVisibleInOpenPayments.visibleInOpenPayments = false
      const walletAddress = await createWalletAddress(deps, {
        tenantId: config.operatorTenantId,
        publicName: faker.person.firstName(),
        additionalProperties: [addProp, addPropNotVisibleInOpenPayments]
      })

      const ctx = createContext<WalletAddressUrlContext>({
        headers: { Accept: 'application/json' },
        url: '/'
      })
      ctx.walletAddressUrl = walletAddress.address
      await expect(walletAddressRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.body).toEqual({
        id: walletAddress.address,
        publicName: walletAddress.publicName,
        assetCode: walletAddress.asset.code,
        assetScale: walletAddress.asset.scale,
        // Ensure the tenant id is returned for auth and resource server:
        authServer: `${config.authServerGrantUrl}/${config.operatorTenantId}`,
        resourceServer: `${config.openPaymentsUrl}/${config.operatorTenantId}`,
        additionalProperties: {
          [addProp.fieldKey]: addProp.fieldValue
        }
      })
    })

    test('returns 404 when fetching wallet address of instance itself', async (): Promise<void> => {
      const ctx = createContext<WalletAddressUrlContext>({
        headers: { Accept: 'application/json' }
      })

      ctx.walletAddressUrl = config.walletAddressUrl

      expect.assertions(2)
      try {
        await walletAddressRoutes.get(ctx)
      } catch (err) {
        assert(err instanceof OpenPaymentsServerRouteError)
        expect(err.status).toBe(404)
        expect(err.message).toBe('Could not get wallet address')
      }
    })

    test('returns wallet address', async (): Promise<void> => {
      const walletAddress = await createWalletAddress(deps, {
        tenantId: config.operatorTenantId,
        publicName: faker.person.firstName()
      })

      const ctx = createContext<WalletAddressUrlContext>({
        headers: { Accept: 'application/json' },
        url: '/'
      })
      ctx.walletAddressUrl = walletAddress.address
      await expect(walletAddressRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.body).toEqual({
        id: walletAddress.address,
        publicName: walletAddress.publicName,
        assetCode: walletAddress.asset.code,
        assetScale: walletAddress.asset.scale,
        // Ensure the tenant id is returned for auth and resource server:
        authServer: `${config.authServerGrantUrl}/${walletAddress.tenantId}`,
        resourceServer: `${config.openPaymentsUrl}/${walletAddress.tenantId}`
      })
    })
  })
})
