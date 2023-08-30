import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { Config } from '../config/app'
import { createTestApp, TestContainer } from '../tests/app'
import { createAsset } from '../tests/asset'
import { truncateTables } from '../tests/tableManager'
import { AutoPeeringService } from './service'

describe('Auto Peering Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let autoPeeringService: AutoPeeringService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({ ...Config, enableAutoPeering: true })
    appContainer = await createTestApp(deps)
    autoPeeringService = await deps.use('autoPeeringService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('getPeeringDetails', (): void => {
    test('returns peering details', async (): Promise<void> => {
      const assets = await Promise.all([
        createAsset(deps),
        createAsset(deps),
        createAsset(deps)
      ])

      expect(autoPeeringService.getPeeringDetails()).resolves.toEqual({
        ilpAddress: Config.ilpAddress,
        assets: expect.arrayContaining(
          assets.map((asset) => ({
            code: asset.code,
            scale: asset.scale
          }))
        )
      })
    })

    test('returns peering details with no assets', async (): Promise<void> => {
      expect(autoPeeringService.getPeeringDetails()).resolves.toEqual({
        ilpAddress: Config.ilpAddress,
        assets: []
      })
    })
  })
})
