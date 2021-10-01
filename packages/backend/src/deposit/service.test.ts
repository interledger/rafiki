import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'

import { DepositService } from './service'
import { DepositError, isDepositError } from './errors'
import { AccountService } from '../account/service'
import { AssetService } from '../asset/service'
import { createTestApp, TestContainer } from '../tests/app'
import { resetGraphileDb } from '../tests/graphileDb'
import { truncateTables } from '../tests/tableManager'
import { GraphileProducer } from '../messaging/graphileProducer'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { AccountFactory } from '../tests/accountFactory'
import { randomAsset } from '../tests/asset'

describe('Deposit Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let workerUtils: WorkerUtils
  let depositService: DepositService
  let accountService: AccountService
  let accountFactory: AccountFactory
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
      depositService = await deps.use('depositService')
      accountService = await deps.use('accountService')
      assetService = await deps.use('assetService')
      accountFactory = new AccountFactory(accountService)
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

  describe('Account Deposit', (): void => {
    test('Can deposit to account', async (): Promise<void> => {
      const { id: accountId, asset } = await accountFactory.build()
      const amount = BigInt(10)
      const deposit = {
        accountId,
        amount
      }
      const depositOrError = await depositService.create(deposit)
      expect(isDepositError(depositOrError)).toEqual(false)
      if (isDepositError(depositOrError)) {
        fail()
      }
      expect(depositOrError).toEqual({
        ...deposit,
        id: depositOrError.id
      })
      await expect(
        accountService.getBalance(accountId)
      ).resolves.toMatchObject({ balance: amount })
      const settlementBalance = await assetService.getSettlementBalance(asset)
      expect(settlementBalance).toEqual(amount)

      {
        const depositOrError = await depositService.create(deposit)
        expect(isDepositError(depositOrError)).toEqual(false)
        if (isDepositError(depositOrError)) {
          fail()
        }
        expect(depositOrError).toEqual({
          ...deposit,
          id: depositOrError.id
        })
        await expect(
          accountService.getBalance(accountId)
        ).resolves.toMatchObject({ balance: amount + amount })
      }
    })

    test('Returns error for invalid id', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const error = await depositService.create({
        id: 'not a uuid v4',
        accountId,
        amount: BigInt(5)
      })
      expect(isDepositError(error)).toEqual(true)
      expect(error).toEqual(DepositError.InvalidId)
    })

    test("Can't deposit to nonexistent account", async (): Promise<void> => {
      const accountId = uuid()
      const error = await depositService.create({
        accountId,
        amount: BigInt(5)
      })
      expect(isDepositError(error)).toEqual(true)
      expect(error).toEqual(DepositError.UnknownAccount)
    })

    test("Can't deposit with duplicate id", async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const amount = BigInt(10)
      const deposit = {
        id: uuid(),
        accountId,
        amount
      }
      await expect(depositService.create(deposit)).resolves.toEqual(deposit)
      await expect(depositService.create(deposit)).resolves.toEqual(
        DepositError.DepositExists
      )
      await expect(
        depositService.create({
          ...deposit,
          amount: BigInt(1)
        })
      ).resolves.toEqual(DepositError.DepositExists)
      const { id: diffAccountId } = await accountFactory.build()
      await expect(
        depositService.create({
          ...deposit,
          accountId: diffAccountId
        })
      ).resolves.toEqual(DepositError.DepositExists)
    })
  })

  describe('Deposit liquidity', (): void => {
    test('Can deposit to liquidity account', async (): Promise<void> => {
      const asset = randomAsset()
      const amount = BigInt(10)
      {
        const error = await depositService.createLiquidity({
          asset,
          amount
        })
        expect(error).toBeUndefined()
        const balance = await assetService.getLiquidityBalance(asset)
        expect(balance).toEqual(amount)
        const settlementBalance = await assetService.getSettlementBalance(asset)
        expect(settlementBalance).toEqual(amount)
      }
      const amount2 = BigInt(5)
      {
        const error = await depositService.createLiquidity({
          asset,
          amount: amount2
        })
        expect(error).toBeUndefined()
        const balance = await assetService.getLiquidityBalance(asset)
        expect(balance).toEqual(amount + amount2)
        const settlementBalance = await assetService.getSettlementBalance(asset)
        expect(settlementBalance).toEqual(amount + amount2)
      }
    })

    test('Returns error for invalid id', async (): Promise<void> => {
      const error = await depositService.createLiquidity({
        id: 'not a uuid v4',
        asset: randomAsset(),
        amount: BigInt(5)
      })
      expect(error).toEqual(DepositError.InvalidId)
    })

    test('Can deposit liquidity with idempotency key', async (): Promise<void> => {
      const asset = randomAsset()
      const amount = BigInt(10)
      const id = uuid()
      {
        const error = await depositService.createLiquidity({
          asset,
          amount,
          id
        })
        expect(error).toBeUndefined()
        const balance = await assetService.getLiquidityBalance(asset)
        expect(balance).toEqual(amount)
      }
      {
        const error = await depositService.createLiquidity({
          asset,
          amount,
          id
        })
        expect(error).toEqual(DepositError.DepositExists)
        const balance = await assetService.getLiquidityBalance(asset)
        expect(balance).toEqual(amount)
      }
    })
  })
})
