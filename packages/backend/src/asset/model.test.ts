import { Knex } from 'knex'

import { AssetService } from './service'
import { Config, IAppConfig } from '../config/app'
import { createTestApp, TestContainer } from '../tests/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { randomAsset } from '../tests/asset'
import { truncateTables } from '../tests/tableManager'
import { Asset, AssetEvent, AssetEventError, AssetEventType } from './model'
import { isAssetError } from './errors'

describe('Models', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let assetService: AssetService
  let knex: Knex

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    assetService = await deps.use('assetService')
    knex = await deps.use('knex')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Asset Model', (): void => {
    describe('onDebit', (): void => {
      let asset: Asset
      let config: IAppConfig
      beforeEach(async (): Promise<void> => {
        config = await deps.use('config')
        const options = {
          ...randomAsset(),
          tenantId: Config.operatorTenantId,
          liquidityThreshold: BigInt(100)
        }
        const assetOrError = await assetService.create(options)
        if (!isAssetError(assetOrError)) {
          asset = assetOrError
        }
      })
      test.each`
        balance
        ${BigInt(50)}
        ${BigInt(99)}
        ${BigInt(100)}
      `(
        'creates webhook event if balance=$balance <= liquidityThreshold',
        async ({ balance }): Promise<void> => {
          await asset.onDebit({ balance }, config)
          const event = (
            await AssetEvent.query(knex)
              .where('type', AssetEventType.LiquidityLow)
              .withGraphFetched('webhooks')
          )[0]
          expect(event.webhooks).toHaveLength(1)
          expect(event).toMatchObject({
            type: AssetEventType.LiquidityLow,
            data: {
              id: asset.id,
              asset: {
                id: asset.id,
                code: asset.code,
                scale: asset.scale
              },
              liquidityThreshold: asset.liquidityThreshold?.toString(),
              balance: balance.toString()
            },
            webhooks: expect.arrayContaining([
              expect.objectContaining({
                id: expect.any(String),
                eventId: event.id,
                recipientTenantId: Config.operatorTenantId,
                processAt: expect.any(Date),
                attempts: 0
              })
            ])
          })
        }
      )
      test('does not create webhook event if balance > liquidityThreshold', async (): Promise<void> => {
        await asset.onDebit({ balance: BigInt(110) }, config)
        await expect(
          AssetEvent.query(knex).where('type', AssetEventType.LiquidityLow)
        ).resolves.toEqual([])
      })
    })
  })

  describe('Asset Event Model', (): void => {
    describe('beforeInsert', (): void => {
      test.each(
        Object.values(AssetEventType).map((type) => ({
          type,
          error: AssetEventError.AssetIdRequired
        }))
      )('Asset Id is required', async ({ type, error }): Promise<void> => {
        expect(
          AssetEvent.query().insert({
            type
          })
        ).rejects.toThrow(error)
      })
    })
  })
})
