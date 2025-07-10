import jestOpenAPI from 'jest-openapi'
import { generateJwk } from '@interledger/http-signature-utils'
import { v4 as uuid } from 'uuid'

import { createContext } from '../../../tests/context'
import { createTestApp, TestContainer } from '../../../tests/app'
import { Config } from '../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import { AppServices, WalletAddressUrlContext } from '../../../app'
import { truncateTables } from '../../../tests/tableManager'
import { WalletAddressKeyRoutes } from './routes'
import { WalletAddressKeyService } from './service'
import { createWalletAddress } from '../../../tests/walletAddress'
import { WalletAddressService } from '../service'
import { OpenPaymentsServerRouteError } from '../../route-errors'
import assert from 'assert'
import { isWalletAddressKeyError } from './errors'

const TEST_KEY = generateJwk({ keyId: uuid() })

describe('Wallet Address Keys Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let walletAddressKeyService: WalletAddressKeyService
  let walletAddressKeyRoutes: WalletAddressKeyRoutes
  let walletAddressService: WalletAddressService

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    const { walletAddressServerSpec } = await deps.use('openApi')
    jestOpenAPI(walletAddressServerSpec)
    walletAddressKeyRoutes = await deps.use('walletAddressKeyRoutes')
    walletAddressKeyService = await deps.use('walletAddressKeyService')
    walletAddressService = await deps.use('walletAddressService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get', (): void => {
    test('returns 200 with all keys for a wallet address', async (): Promise<void> => {
      const walletAddress = await createWalletAddress(deps, {
        tenantId: Config.operatorTenantId
      })

      const keyOption = {
        walletAddressId: walletAddress.id,
        jwk: TEST_KEY
      }
      const key = await walletAddressKeyService.create(keyOption)
      assert.ok(!isWalletAddressKeyError(key))

      const ctx = createContext<WalletAddressUrlContext>({
        headers: { Accept: 'application/json' },
        url: `/jwks.json`
      })
      ctx.walletAddressUrl = walletAddress.address

      await expect(walletAddressKeyRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.body).toEqual({
        keys: [key.jwk]
      })
    })

    test('returns 200 with empty array if no keys for a wallet address', async (): Promise<void> => {
      const walletAddress = await createWalletAddress(deps, {
        tenantId: Config.operatorTenantId
      })

      const ctx = createContext<WalletAddressUrlContext>({
        headers: { Accept: 'application/json' },
        url: `/jwks.json`
      })
      ctx.walletAddressUrl = walletAddress.address

      await expect(walletAddressKeyRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.body).toEqual({
        keys: []
      })
    })

    test('returns 200 with backend key', async (): Promise<void> => {
      const config = await deps.use('config')
      const jwk = generateJwk({
        privateKey: config.privateKey,
        keyId: config.keyId
      })

      const ctx = createContext<WalletAddressUrlContext>({
        headers: { Accept: 'application/json' },
        url: '/jwks.json'
      })
      ctx.walletAddressUrl = config.walletAddressUrl

      await expect(walletAddressKeyRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.body).toEqual({
        keys: [jwk]
      })
    })

    test('throws 404 error for nonexistent wallet address', async (): Promise<void> => {
      const ctx = createContext<WalletAddressUrlContext>({
        headers: { Accept: 'application/json' }
      })
      jest
        .spyOn(walletAddressService, 'getOrPollByUrl')
        .mockResolvedValueOnce(undefined)

      expect.assertions(2)
      try {
        await walletAddressKeyRoutes.get(ctx)
      } catch (err) {
        assert(err instanceof OpenPaymentsServerRouteError)
        expect(err.status).toBe(404)
        expect(err.message).toBe('Could not get wallet address')
      }
    })

    test('throws 404 error for inactive wallet address', async (): Promise<void> => {
      const walletAddress = await createWalletAddress(deps, {
        tenantId: Config.operatorTenantId
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
        await walletAddressKeyRoutes.get(ctx)
      } catch (err) {
        assert(err instanceof OpenPaymentsServerRouteError)
        expect(err.status).toBe(404)
        expect(err.message).toBe('Could not get wallet address')
        await expect(getOrPollByUrlSpy.mock.results[0].value).resolves.toEqual(
          walletAddress
        )
      }
    })
  })
})
