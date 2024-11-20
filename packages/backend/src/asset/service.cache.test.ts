import assert from 'assert'
import { v4 as uuid } from 'uuid'

import { AssetError, isAssetError } from './errors'
import { AssetService } from './service'
import { Asset } from './model'
import { Pagination, SortOrder } from '../shared/baseModel'
import { getPageTests } from '../shared/baseModel.test'
import { createTestApp, TestContainer } from '../tests/app'
import { createAsset, randomAsset } from '../tests/asset'
import { truncateTables } from '../tests/tableManager'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'

describe('Asset Service using Cache', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let assetService: AssetService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({
      ...Config,
      localCacheDuration: 5_000 // 5-second default.
    })
    appContainer = await createTestApp(deps)
    assetService = await deps.use('assetService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('create', (): void => {
    test.each`
      withdrawalThreshold | liquidityThreshold
      ${undefined}        | ${undefined}
      ${BigInt(5)}        | ${undefined}
      ${undefined}        | ${BigInt(5)}
      ${BigInt(5)}        | ${BigInt(5)}
    `(
      'Asset can be created and fetched',
      async ({ withdrawalThreshold, liquidityThreshold }): Promise<void> => {
        const options = {
          ...randomAsset(),
          withdrawalThreshold,
          liquidityThreshold
        }
        const asset = await assetService.create(options)
        assert.ok(!isAssetError(asset))
        expect(asset).toMatchObject({
          ...options,
          id: asset.id,
          ledger: asset.ledger,
          withdrawalThreshold: withdrawalThreshold || null,
          liquidityThreshold: liquidityThreshold || null
        })
        await expect(assetService.get(asset.id)).resolves.toEqual(asset)
      }
    )
  })

  describe('get', (): void => {
    test('Can get asset by id', async (): Promise<void> => {
      const asset = await assetService.create(randomAsset())
      assert.ok(!isAssetError(asset))
      await expect(assetService.get(asset.id)).resolves.toEqual(asset)
    })

    test('Cannot get unknown asset', async (): Promise<void> => {
      await expect(assetService.get(uuid())).resolves.toBeUndefined()
    })
  })

  describe('update', (): void => {
    describe.each`
      withdrawalThreshold | liquidityThreshold
      ${null}             | ${null}
      ${BigInt(0)}        | ${null}
      ${BigInt(5)}        | ${null}
      ${null}             | ${BigInt(0)}
      ${null}             | ${BigInt(5)}
      ${BigInt(0)}        | ${BigInt(0)}
      ${BigInt(5)}        | ${BigInt(5)}
    `(
      'Asset threshold can be updated from withdrawalThreshold: $withdrawalThreshold, liquidityThreshold: $liquidityThreshold',
      ({ withdrawalThreshold, liquidityThreshold }): void => {
        let assetId: string

        beforeEach(async (): Promise<void> => {
          const asset = await assetService.create({
            ...randomAsset(),
            withdrawalThreshold,
            liquidityThreshold
          })
          assert.ok(!isAssetError(asset))
          expect(asset.withdrawalThreshold).toEqual(withdrawalThreshold)
          assetId = asset.id
        })

        test.each`
          withdrawalThreshold | liquidityThreshold
          ${null}             | ${null}
          ${BigInt(0)}        | ${null}
          ${BigInt(5)}        | ${null}
          ${null}             | ${BigInt(0)}
          ${null}             | ${BigInt(5)}
          ${BigInt(0)}        | ${BigInt(0)}
          ${BigInt(5)}        | ${BigInt(5)}
        `(
          'to withdrawalThreshold: $withdrawalThreshold, liquidityThreshold: $liquidityThreshold',
          async ({
            withdrawalThreshold,
            liquidityThreshold
          }): Promise<void> => {
            const asset = await assetService.update({
              id: assetId,
              withdrawalThreshold,
              liquidityThreshold
            })
            assert.ok(!isAssetError(asset))
            expect(asset.withdrawalThreshold).toEqual(withdrawalThreshold)
            expect(asset.liquidityThreshold).toEqual(liquidityThreshold)
            await expect(assetService.get(assetId)).resolves.toEqual(asset)
          }
        )
      }
    )
  })

  describe('getPage', (): void => {
    getPageTests({
      createModel: () => createAsset(deps),
      getPage: (pagination?: Pagination, sortOrder?: SortOrder) =>
        assetService.getPage(pagination, sortOrder)
    })
  })

  describe('getAll', (): void => {
    test('returns all assets', async (): Promise<void> => {
      const assets: (Asset | AssetError)[] = []
      for (let i = 0; i < 3; i++) {
        const asset = await assetService.create(randomAsset())
        assets.push(asset)
      }

      await expect(assetService.getAll()).resolves.toEqual(assets)
    })

    test('returns empty array if no assets', async (): Promise<void> => {
      await expect(assetService.getAll()).resolves.toEqual([])
    })
  })

  describe('delete', (): void => {
    test('Can delete asset', async (): Promise<void> => {
      const newAsset = await assetService.create(randomAsset())
      assert.ok(!isAssetError(newAsset))
      const newAssetId = newAsset.id

      const deletedAsset = await assetService.delete({
        id: newAssetId,
        deletedAt: new Date()
      })
      assert.ok(!isAssetError(deletedAsset))
      expect(deletedAsset.deletedAt).not.toBeNull()
    })
  })
})
