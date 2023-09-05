import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '..'
import { AppContext, AppServices } from '../app'
import { Config } from '../config/app'
import { createTestApp, TestContainer } from '../tests/app'
import { createAsset } from '../tests/asset'
import { createContext } from '../tests/context'
import { truncateTables } from '../tests/tableManager'
import { AutoPeeringRoutes } from './routes'

describe('Auto Peering Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let autoPeeringRoutes: AutoPeeringRoutes

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({ ...Config, enableAutoPeering: true })
    appContainer = await createTestApp(deps)
    autoPeeringRoutes = await deps.use('autoPeeringRoutes')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get', (): void => {
    test('returns peering details with assets', async (): Promise<void> => {
      const assets = await Promise.all([
        createAsset(deps),
        createAsset(deps),
        createAsset(deps)
      ])

      const ctx = createContext<AppContext>({
        headers: { Accept: 'application/json' },
        url: `/`
      })

      await expect(autoPeeringRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.body).toEqual({
        ilpAddress: Config.ilpAddress,
        assets: expect.arrayContaining(
          assets.map((asset) => ({
            code: asset.code,
            scale: asset.scale
          }))
        )
      })
    })

    test('returns peering details without assets', async (): Promise<void> => {
      const ctx = createContext<AppContext>({
        headers: { Accept: 'application/json' },
        url: `/`
      })

      await expect(autoPeeringRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.body).toEqual({
        ilpAddress: Config.ilpAddress,
        assets: []
      })
    })
  })
})
