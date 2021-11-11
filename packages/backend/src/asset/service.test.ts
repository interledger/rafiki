import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'

import { AssetService } from './service'
import { AccountType } from '../tigerbeetle/account/service'
import { createTestApp, TestContainer } from '../tests/app'
import { randomAsset } from '../tests/asset'
import { resetGraphileDb } from '../tests/graphileDb'
import { truncateTables } from '../tests/tableManager'
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
  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }

  beforeAll(
    async (): Promise<void> => {
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
    }
  )

  describe('Create or Get Asset', (): void => {
    test('Asset can be created or fetched', async (): Promise<void> => {
      const asset = randomAsset()
      await expect(assetService.get(asset)).resolves.toBeUndefined()
      const newAsset = await assetService.getOrCreate(asset)
      const expectedAsset = {
        ...asset,
        id: newAsset.id,
        unit: newAsset.unit
      }
      await expect(newAsset).toMatchObject(expectedAsset)
      await expect(assetService.get(asset)).resolves.toMatchObject(
        expectedAsset
      )
      await expect(assetService.getOrCreate(asset)).resolves.toMatchObject(
        expectedAsset
      )
    })

    test('Asset accounts are created', async (): Promise<void> => {
      const accountService = await deps.use('accountService')
      const asset = await assetService.getOrCreate(randomAsset())
      const liquidityAccount = await asset.getLiquidityAccount()
      expect(liquidityAccount.asset).toEqual(asset)
      await expect(
        accountService.getType(liquidityAccount.id)
      ).resolves.toEqual(AccountType.Credit)

      const settlementAccount = await asset.getSettlementAccount()
      expect(settlementAccount.asset).toEqual(asset)
      await expect(
        accountService.getType(settlementAccount.id)
      ).resolves.toEqual(AccountType.Debit)

      const sentAccount = await asset.getSentAccount()
      expect(sentAccount.asset).toEqual(asset)
      await expect(accountService.getType(sentAccount.id)).resolves.toEqual(
        AccountType.Debit
      )

      const receiveLimitAccount = await asset.getReceiveLimitAccount()
      expect(receiveLimitAccount.asset).toEqual(asset)
      await expect(
        accountService.getType(receiveLimitAccount.id)
      ).resolves.toEqual(AccountType.Credit)
    })

    test('Can get asset by id', async (): Promise<void> => {
      const asset = await assetService.getOrCreate({
        code: 'EUR',
        scale: 2
      })
      await expect(assetService.getById(asset.id)).resolves.toEqual(asset)

      await expect(assetService.getById(uuid())).resolves.toBeUndefined()
    })

    test('Can get asset liquidity account', async (): Promise<void> => {
      const asset = await assetService.getOrCreate(randomAsset())
      await expect(
        assetService.getLiquidityAccount(asset.id)
      ).resolves.toMatchObject({
        assetId: asset.id,
        asset
      })

      await expect(
        assetService.getLiquidityAccount(uuid())
      ).resolves.toBeUndefined()
    })
  })
})
