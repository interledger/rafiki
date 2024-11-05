import { Knex } from 'knex'

import { AssetService } from './service'
import { Config } from '../config/app'
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
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Asset Model', (): void => {
    describe('onDebit', (): void => {
      let asset: Asset
      beforeEach(async (): Promise<void> => {
        const options = {
          ...randomAsset(),
          liquidityThresholdLow: BigInt(100),
          liquidityThresholdHigh: BigInt(500)
        }
        const assetOrError = await assetService.create(options)
        if (!isAssetError(assetOrError)) {
          asset = assetOrError
        }
      })

      test.each`
        balance
        ${BigInt(500)}
        ${BigInt(1000)}
      `(
        'creates webhook event if balance=$balance >= liquidityThresholdHigh',
        async ({ balance }): Promise<void> => {
          await asset.onDebit({ balance })
          const event = (
            await AssetEvent.query(knex).where('type', AssetEventType.LiquidityHigh)
          )[0]

          expect(event).toMatchObject({
            type: AssetEventType.LiquidityHigh,
            data: {
              id: asset.id,
              asset: {
                id: asset.id,
                code: asset.code,
                scale: asset.scale
              },
              liquidityThreshold: asset.liquidityThresholdHigh?.toString(),
              balance: balance.toString()
            }
          })
        }
      )

      test.each`
        balance
        ${BigInt(50)}
        ${BigInt(99)}
        ${BigInt(100)}
      `(
        'creates webhook event if balance=$balance <= liquidityThresholdLow',
        async ({ balance }): Promise<void> => {
          await asset.onDebit({ balance })
          const event = (
            await AssetEvent.query(knex).where(
              'type',
              AssetEventType.LiquidityLow
            )
          )[0]
          expect(event).toMatchObject({
            type: AssetEventType.LiquidityLow,
            data: {
              id: asset.id,
              asset: {
                id: asset.id,
                code: asset.code,
                scale: asset.scale
              },
              liquidityThreshold: asset.liquidityThresholdLow?.toString(),
              balance: balance.toString()
            }
          })
        }
      )
      test('does not create webhook event if balance > liquidityThresholdLow', async (): Promise<void> => {
        await asset.onDebit({ balance: BigInt(110) })
        await expect(
          AssetEvent.query(knex).where('type', AssetEventType.LiquidityLow)
        ).resolves.toEqual([])
      })


      test.each`
        balance
        ${BigInt(200)}
        ${BigInt(499)}
      `(
        'does not create webhook event if balance=$balance < liquidityThresholdLow',
        async ({ balance }): Promise<void> => {
          await asset.onDebit({ balance })
          await expect(
            AssetEvent.query(knex).where('type', AssetEventType.LiquidityHigh)
          ).resolves.toEqual([])
        }
      )
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
