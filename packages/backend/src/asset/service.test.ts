import assert from 'assert'
import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { StartedTestContainer } from 'testcontainers'
import { v4 as uuid } from 'uuid'

import { AssetError, isAssetError } from './errors'
import { AssetService } from './service'
import { Pagination } from '../shared/baseModel'
import { getPageTests } from '../shared/baseModel.test'
import { createTestApp, TestContainer } from '../tests/app'
import { randomAsset } from '../tests/asset'
import { resetGraphileDb } from '../tests/graphileDb'
import { truncateTables } from '../tests/tableManager'
import {
  startTigerbeetleContainer,
  TIGERBEETLE_PORT
} from '../tests/tigerbeetle'
import { GraphileProducer } from '../messaging/graphileProducer'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'

describe('Asset Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let workerUtils: WorkerUtils
  let assetService: AssetService
  let knex: Knex
  let tigerbeetleContainer: StartedTestContainer
  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }

  beforeAll(
    async (): Promise<void> => {
      tigerbeetleContainer = await startTigerbeetleContainer()
      Config.tigerbeetleReplicaAddresses = [
        tigerbeetleContainer.getMappedPort(TIGERBEETLE_PORT)
      ]

      deps = await initIocContainer(Config)
      deps.bind('messageProducer', async () => mockMessageProducer)
      appContainer = await createTestApp(deps)
      workerUtils = await makeWorkerUtils({
        connectionString: appContainer.connectionUrl
      })
      await workerUtils.migrate()
      messageProducer.setUtils(workerUtils)
      knex = await deps.use('knex')
      assetService = await deps.use('assetService')
    }
  )

  afterEach(
    async (): Promise<void> => {
      await truncateTables(knex)
    }
  )

  afterAll(
    async (): Promise<void> => {
      await resetGraphileDb(knex)
      await appContainer.shutdown()
      await workerUtils.release()
      await tigerbeetleContainer.stop()
    }
  )

  describe('create', (): void => {
    test.each`
      withdrawalThreshold
      ${undefined}
      ${BigInt(5)}
    `(
      'Asset can be created and fetched',
      async ({ withdrawalThreshold }): Promise<void> => {
        const options = {
          ...randomAsset(),
          withdrawalThreshold
        }
        await expect(assetService.get(options)).resolves.toBeUndefined()
        const asset = await assetService.create(options)
        assert.ok(!isAssetError(asset))
        await expect(asset).toMatchObject({
          ...options,
          id: asset.id,
          unit: asset.unit,
          withdrawalThreshold: withdrawalThreshold || null
        })
        await expect(assetService.get(asset)).resolves.toEqual(asset)
        await expect(assetService.getOrCreate(asset)).resolves.toEqual(asset)
      }
    )

    test('Asset accounts are created', async (): Promise<void> => {
      const accountingService = await deps.use('accountingService')
      const liquiditySpy = jest.spyOn(
        accountingService,
        'createLiquidityAccount'
      )
      const settlementSpy = jest.spyOn(
        accountingService,
        'createSettlementAccount'
      )

      const asset = await assetService.create(randomAsset())
      assert.ok(!isAssetError(asset))

      expect(liquiditySpy).toHaveBeenCalledWith(asset)
      expect(settlementSpy).toHaveBeenCalledWith(asset.unit)

      await expect(accountingService.getBalance(asset.id)).resolves.toEqual(
        BigInt(0)
      )
      await expect(
        accountingService.getSettlementBalance(asset.unit)
      ).resolves.toEqual(BigInt(0))
    })

    test('Asset can be created with minimum account withdrawal amount', async (): Promise<void> => {
      const options = {
        ...randomAsset(),
        withdrawalThreshold: BigInt(10)
      }
      const asset = await assetService.getOrCreate(options)
      assert.ok(!isAssetError(asset))
      await expect(asset).toMatchObject({
        ...options,
        id: asset.id,
        unit: asset.unit
      })
      await expect(assetService.get(asset)).resolves.toEqual(asset)
      await expect(assetService.getOrCreate(asset)).resolves.toEqual(asset)
    })

    test('Cannot create duplicate asset', async (): Promise<void> => {
      const options = randomAsset()
      await expect(assetService.create(options)).resolves.toMatchObject(options)
      await expect(assetService.create(options)).resolves.toEqual(
        AssetError.DuplicateAsset
      )
    })
  })

  describe('getOrCreate', (): void => {
    test('Asset can be created or fetched', async (): Promise<void> => {
      const options = randomAsset()
      await expect(assetService.get(options)).resolves.toBeUndefined()
      const asset = await assetService.getOrCreate(options)
      assert.ok(!isAssetError(asset))
      await expect(asset).toMatchObject({
        ...options,
        id: asset.id,
        unit: asset.unit
      })
      await expect(assetService.get(asset)).resolves.toEqual(asset)
      await expect(assetService.getOrCreate(asset)).resolves.toEqual(asset)
    })
  })

  describe('get', (): void => {
    test('Can get asset', async (): Promise<void> => {
      const options = randomAsset()
      const asset = await assetService.create(options)
      await expect(assetService.get(options)).resolves.toEqual(asset)
    })

    test('Cannot get unknown asset', async (): Promise<void> => {
      await expect(assetService.get(randomAsset())).resolves.toBeUndefined()
    })
  })

  describe('getById', (): void => {
    test('Can get asset by id', async (): Promise<void> => {
      const asset = await assetService.create(randomAsset())
      assert.ok(!isAssetError(asset))
      await expect(assetService.getById(asset.id)).resolves.toEqual(asset)
    })

    test('Cannot get unknown asset', async (): Promise<void> => {
      await expect(assetService.getById(uuid())).resolves.toBeUndefined()
    })
  })

  describe('update', (): void => {
    describe.each`
      withdrawalThreshold
      ${null}
      ${BigInt(0)}
      ${BigInt(5)}
    `(
      "Asset's withdrawal threshold can be updated from $withdrawalThreshold",
      ({ withdrawalThreshold }): void => {
        let assetId: string

        beforeEach(
          async (): Promise<void> => {
            const asset = await assetService.create({
              ...randomAsset(),
              withdrawalThreshold
            })
            assert.ok(!isAssetError(asset))
            await expect(asset.withdrawalThreshold).toEqual(withdrawalThreshold)
            assetId = asset.id
          }
        )

        test.each`
          withdrawalThreshold
          ${null}
          ${BigInt(0)}
          ${BigInt(5)}
        `(
          'to $withdrawalThreshold',
          async ({ withdrawalThreshold }): Promise<void> => {
            const asset = await assetService.update({
              id: assetId,
              withdrawalThreshold
            })
            assert.ok(!isAssetError(asset))
            expect(asset.withdrawalThreshold).toEqual(withdrawalThreshold)
            await expect(assetService.getById(assetId)).resolves.toEqual(asset)
          }
        )
      }
    )

    test('Cannot update unknown asset', async (): Promise<void> => {
      await expect(
        assetService.update({
          id: uuid(),
          withdrawalThreshold: BigInt(10)
        })
      ).resolves.toEqual(AssetError.UnknownAsset)
    })
  })

  describe('getPage', (): void => {
    getPageTests({
      createModel: () => assetService.getOrCreate(randomAsset()),
      getPage: (pagination: Pagination) => assetService.getPage(pagination)
    })
  })
})
