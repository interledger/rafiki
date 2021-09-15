import { Model } from 'objection'
import { Transaction } from 'knex'

import { AssetService } from './service'
import { DepositService } from '../deposit/service'
import {
  AccountFactory,
  createTestServices,
  TestServices,
  randomAsset
} from '../testsHelpers'

describe('Asset Service', (): void => {
  let assetService: AssetService
  let accountFactory: AccountFactory
  let depositService: DepositService
  let services: TestServices
  let trx: Transaction

  beforeAll(
    async (): Promise<void> => {
      services = await createTestServices()
      ;({ assetService, depositService } = services)
      accountFactory = new AccountFactory(services.accountsService)
    }
  )

  beforeEach(
    async (): Promise<void> => {
      trx = await services.knex.transaction()
      Model.knex(trx)
    }
  )

  afterEach(
    async (): Promise<void> => {
      await trx.rollback()
      await trx.destroy()
    }
  )

  afterAll(
    async (): Promise<void> => {
      await services.shutdown()
    }
  )

  describe('Get Liquidity Balance', (): void => {
    test('Can retrieve liquidity account balance', async (): Promise<void> => {
      const { asset } = await accountFactory.build()

      {
        const balance = await assetService.getLiquidityBalance(asset)
        expect(balance).toEqual(BigInt(0))
      }

      const amount = BigInt(10)
      await depositService.createLiquidity({
        asset,
        amount
      })

      {
        const balance = await assetService.getLiquidityBalance(asset)
        expect(balance).toEqual(amount)
      }
    })

    test('Returns undefined for nonexistent liquidity account', async (): Promise<void> => {
      const asset = randomAsset()
      await expect(
        assetService.getLiquidityBalance(asset)
      ).resolves.toBeUndefined()
    })
  })

  describe('Get Settlement Balance', (): void => {
    test('Can retrieve settlement account balance', async (): Promise<void> => {
      const { asset } = await accountFactory.build()

      {
        const balance = await assetService.getSettlementBalance(asset)
        expect(balance).toEqual(BigInt(0))
      }

      const amount = BigInt(10)
      await depositService.createLiquidity({
        asset,
        amount
      })

      {
        const balance = await assetService.getSettlementBalance(asset)
        expect(balance).toEqual(amount)
      }
    })

    test('Returns undefined for nonexistent settlement account', async (): Promise<void> => {
      const asset = randomAsset()
      await expect(
        assetService.getSettlementBalance(asset)
      ).resolves.toBeUndefined()
    })
  })
})
