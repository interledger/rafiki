import jestOpenAPI from 'jest-openapi'
import { generateJwk } from '@interledger/http-signature-utils'
import { v4 as uuid } from 'uuid'

import { createContext } from '../../../tests/context'
import { createTestApp, TestContainer } from '../../../tests/app'
import { Config } from '../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import { AppServices, WalletAddressKeysContext } from '../../../app'
import { truncateTables } from '../../../tests/tableManager'
import { WalletAddressKeyRoutes } from './routes'
import { WalletAddressKeyService } from './service'
import { createWalletAddress } from '../../../tests/walletAddress'

const TEST_KEY = generateJwk({ keyId: uuid() })

describe('Wallet Address Keys Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let walletAddressKeyService: WalletAddressKeyService
  let walletAddressKeyRoutes: WalletAddressKeyRoutes
  const mockMessageProducer = {
    send: jest.fn()
  }

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    deps.bind('messageProducer', async () => mockMessageProducer)
    appContainer = await createTestApp(deps)
    const { resourceServerSpec } = await deps.use('openApi')
    jestOpenAPI(resourceServerSpec)
    walletAddressKeyService = await deps.use('walletAddressKeyService')
  })

  beforeEach(async (): Promise<void> => {
    walletAddressKeyRoutes = await deps.use('walletAddressKeyRoutes')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('getKeys', (): void => {
    test('returns 200 with all keys for a wallet address', async (): Promise<void> => {
      const walletAddress = await createWalletAddress(deps)

      const keyOption = {
        walletAddressId: walletAddress.id,
        jwk: TEST_KEY
      }
      const key = await walletAddressKeyService.create(keyOption)

      const ctx = createContext<WalletAddressKeysContext>({
        headers: { Accept: 'application/json' },
        url: `/jwks.json`
      })
      ctx.walletAddress = walletAddress
      ctx.walletAddressUrl = walletAddress.url

      await expect(
        walletAddressKeyRoutes.getKeysByWalletAddressId(ctx)
      ).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.body).toEqual({
        keys: [key.jwk]
      })
    })

    test('returns 200 with empty array if no keys for a wallet address', async (): Promise<void> => {
      const walletAddress = await createWalletAddress(deps)

      const ctx = createContext<WalletAddressKeysContext>({
        headers: { Accept: 'application/json' },
        url: `/jwks.json`
      })
      ctx.walletAddress = walletAddress
      ctx.walletAddressUrl = walletAddress.url

      await expect(
        walletAddressKeyRoutes.getKeysByWalletAddressId(ctx)
      ).resolves.toBeUndefined()
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

      const ctx = createContext<WalletAddressKeysContext>({
        headers: { Accept: 'application/json' },
        url: '/jwks.json'
      })
      ctx.walletAddressUrl = config.walletAddressUrl

      await expect(
        walletAddressKeyRoutes.getKeysByWalletAddressId(ctx)
      ).resolves.toBeUndefined()
      expect(ctx.body).toEqual({
        keys: [jwk]
      })
    })

    test('returns 404 if wallet address does not exist', async (): Promise<void> => {
      const ctx = createContext<WalletAddressKeysContext>({
        headers: { Accept: 'application/json' },
        url: `/jwks.json`
      })
      ctx.walletAddress = undefined

      await expect(
        walletAddressKeyRoutes.getKeysByWalletAddressId(ctx)
      ).rejects.toHaveProperty('status', 404)
    })
  })
})
