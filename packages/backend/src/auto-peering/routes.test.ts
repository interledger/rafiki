import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { Config, IAppConfig } from '../config/app'
import { createTestApp, TestContainer } from '../tests/app'
import { createAsset } from '../tests/asset'
import { createContext } from '../tests/context'
import { truncateTables } from '../tests/tableManager'
import { AutoPeeringError, errorToCode, errorToMessage } from './errors'
import { AutoPeeringRoutes, PeerRequestContext } from './routes'

describe('Auto Peering Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let autoPeeringRoutes: AutoPeeringRoutes
  let config: IAppConfig

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({ ...Config, enableAutoPeering: true })
    appContainer = await createTestApp(deps)
    autoPeeringRoutes = await deps.use('autoPeeringRoutes')
    config = await deps.use('config')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('acceptPeerRequest', (): void => {
    test('returns peering details', async (): Promise<void> => {
      const asset = await createAsset(deps)

      const ctx = createContext<PeerRequestContext>({
        headers: { Accept: 'application/json' },
        url: `/`,
        body: {
          staticIlpAddress: 'test.rafiki-money',
          ilpConnectorAddress: 'http://peer.rafiki.money',
          asset: { code: asset.code, scale: asset.scale },
          httpToken: 'someHttpToken',
          maxPacketAmount: 1000,
          name: 'Rafiki Money'
        }
      })

      await expect(
        autoPeeringRoutes.acceptPeerRequest(ctx)
      ).resolves.toBeUndefined()
      expect(ctx.status).toBe(200)
      expect(ctx.body).toEqual({
        staticIlpAddress: config.ilpAddress,
        ilpConnectorAddress: config.ilpConnectorAddress,
        httpToken: expect.any(String),
        name: config.instanceName
      })
    })

    test('properly handles error', async (): Promise<void> => {
      const ctx = createContext<PeerRequestContext>({
        headers: { Accept: 'application/json' },
        url: `/`,
        body: {
          staticIlpAddress: 'test.rafiki-money',
          ilpConnectorAddress: 'http://peer.rafiki.money',
          asset: { code: 'ABC', scale: 2 },
          httpToken: 'someHttpToken'
        }
      })

      await expect(
        autoPeeringRoutes.acceptPeerRequest(ctx)
      ).resolves.toBeUndefined()
      expect(ctx.status).toBe(errorToCode[AutoPeeringError.UnknownAsset])
      expect(ctx.body).toEqual({
        error: {
          code: errorToCode[AutoPeeringError.UnknownAsset],
          message: errorToMessage[AutoPeeringError.UnknownAsset],
          type: AutoPeeringError.UnknownAsset
        }
      })
    })
  })
})
