import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'

import { LiquidityService } from './service'
import { LiquidityError } from './errors'
import {
  AccountOptions,
  AccountService,
  AssetAccount,
  isAssetAccount
} from '../tigerbeetle/account/service'
import { createTestApp, TestContainer } from '../tests/app'
import { resetGraphileDb } from '../tests/graphileDb'
import { GraphileProducer } from '../messaging/graphileProducer'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { AccountFactory } from '../tests/accountFactory'
import { randomUnit } from '../tests/asset'
import { truncateTables } from '../tests/tableManager'

describe('Liquidity Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let workerUtils: WorkerUtils
  let liquidityService: LiquidityService
  let accountService: AccountService
  let accountFactory: AccountFactory
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
      liquidityService = await deps.use('liquidityService')
      accountService = await deps.use('accountService')
      const transferService = await deps.use('transferService')
      accountFactory = new AccountFactory(accountService, transferService)
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

  describe.each(['account', 'asset'])('Add %s liquidity', (type): void => {
    let account: AccountOptions

    beforeEach(
      async (): Promise<void> => {
        if (type === 'account') {
          account = await accountFactory.build()
        } else {
          account = {
            asset: {
              unit: randomUnit(),
              account: AssetAccount.Liquidity
            }
          }
          await accountService.createAssetAccounts(account.asset.unit)
        }
      }
    )

    test(`Can add liquidity to ${type}`, async (): Promise<void> => {
      const amount = BigInt(10)
      for (let i = 0; i < 2; i++) {
        await expect(
          liquidityService.add({
            account,
            amount
          })
        ).resolves.toBeUndefined()
        const balance = isAssetAccount(account)
          ? await accountService.getAssetAccountBalance(
              account.asset.unit,
              account.asset.account
            )
          : await accountService.getBalance(account.id)
        expect(balance).toEqual(amount * BigInt(i + 1))
        await expect(
          accountService.getAssetAccountBalance(
            account.asset.unit,
            AssetAccount.Settlement
          )
        ).resolves.toEqual(amount * BigInt(i + 1))
      }
    })

    test('Returns error for invalid id', async (): Promise<void> => {
      await expect(
        liquidityService.add({
          id: 'not a uuid v4',
          account,
          amount: BigInt(5)
        })
      ).resolves.toEqual(LiquidityError.InvalidId)
    })

    test('Returns error for duplicate id', async (): Promise<void> => {
      const options = {
        id: uuid(),
        account,
        amount: BigInt(10)
      }
      await expect(liquidityService.add(options)).resolves.toBeUndefined()
      await expect(liquidityService.add(options)).resolves.toEqual(
        LiquidityError.TransferExists
      )
    })
  })

  describe.each(['account', 'asset'])('Withdraw %s liquidity', (type): void => {
    let account: AccountOptions
    const startingBalance = BigInt(100)

    beforeEach(
      async (): Promise<void> => {
        if (type === 'account') {
          account = await accountFactory.build()
        } else {
          account = {
            asset: {
              unit: randomUnit(),
              account: AssetAccount.Liquidity
            }
          }
          await accountService.createAssetAccounts(account.asset.unit)
        }
        await expect(
          liquidityService.add({
            account,
            amount: startingBalance
          })
        ).resolves.toBeUndefined()
      }
    )

    test(`Can withdraw liquidity from ${type}`, async (): Promise<void> => {
      const amount = BigInt(5)
      for (let i = 0; i < 2; i++) {
        const id = uuid()
        await expect(
          liquidityService.createWithdrawal({
            id,
            account,
            amount
          })
        ).resolves.toBeUndefined()
        const balance = isAssetAccount(account)
          ? await accountService.getAssetAccountBalance(
              account.asset.unit,
              account.asset.account
            )
          : await accountService.getBalance(account.id)
        expect(balance).toEqual(startingBalance - amount * BigInt(i + 1))
        await expect(
          accountService.getAssetAccountBalance(
            account.asset.unit,
            AssetAccount.Settlement
          )
        ).resolves.toEqual(startingBalance - amount * BigInt(i))

        await expect(
          liquidityService.finalizeWithdrawal(id)
        ).resolves.toBeUndefined()
        {
          const balance = isAssetAccount(account)
            ? await accountService.getAssetAccountBalance(
                account.asset.unit,
                account.asset.account
              )
            : await accountService.getBalance(account.id)
          expect(balance).toEqual(startingBalance - amount * BigInt(i + 1))
        }
        await expect(
          accountService.getAssetAccountBalance(
            account.asset.unit,
            AssetAccount.Settlement
          )
        ).resolves.toEqual(startingBalance - amount * BigInt(i + 1))
      }
    })

    test("Can't create withdrawal with invalid id", async (): Promise<void> => {
      await expect(
        liquidityService.createWithdrawal({
          id: 'not a uuid v4',
          account,
          amount: BigInt(5)
        })
      ).resolves.toEqual(LiquidityError.InvalidId)
    })

    test('Returns error for insufficient balance', async (): Promise<void> => {
      const amount = startingBalance + BigInt(10)
      await expect(
        liquidityService.createWithdrawal({
          id: uuid(),
          account,
          amount
        })
      ).resolves.toEqual(LiquidityError.InsufficientBalance)
      const balance = isAssetAccount(account)
        ? await accountService.getAssetAccountBalance(
            account.asset.unit,
            account.asset.account
          )
        : await accountService.getBalance(account.id)
      expect(balance).toEqual(startingBalance)

      await expect(
        accountService.getAssetAccountBalance(
          account.asset.unit,
          AssetAccount.Settlement
        )
      ).resolves.toEqual(startingBalance)
    })

    test("Can't create withdrawal with duplicate id", async (): Promise<void> => {
      const withdrawal = {
        id: uuid(),
        account,
        amount: BigInt(5)
      }
      await expect(
        liquidityService.createWithdrawal(withdrawal)
      ).resolves.toBeUndefined()
      await expect(
        liquidityService.createWithdrawal(withdrawal)
      ).resolves.toEqual(LiquidityError.TransferExists)
    })

    test('Can rollback withdrawal', async (): Promise<void> => {
      const id = uuid()
      const amount = BigInt(5)
      await expect(
        liquidityService.createWithdrawal({
          id,
          account,
          amount
        })
      ).resolves.toBeUndefined()
      await expect(
        liquidityService.rollbackWithdrawal(id)
      ).resolves.toBeUndefined()
      const balance = isAssetAccount(account)
        ? await accountService.getAssetAccountBalance(
            account.asset.unit,
            account.asset.account
          )
        : await accountService.getBalance(account.id)
      expect(balance).toEqual(startingBalance)
    })

    test("Can't finalize non-existent withdrawal", async (): Promise<void> => {
      await expect(
        liquidityService.finalizeWithdrawal(uuid())
      ).resolves.toEqual(LiquidityError.UnknownWithdrawal)
    })

    test("Can't finalize invalid withdrawal id", async (): Promise<void> => {
      const id = 'not a uuid v4'
      await expect(liquidityService.finalizeWithdrawal(id)).resolves.toEqual(
        LiquidityError.InvalidId
      )
    })

    test("Can't finalize finalized withdrawal", async (): Promise<void> => {
      const id = uuid()
      await expect(
        liquidityService.createWithdrawal({
          id,
          account,
          amount: BigInt(5)
        })
      ).resolves.toBeUndefined()
      await expect(
        liquidityService.finalizeWithdrawal(id)
      ).resolves.toBeUndefined()
      await expect(liquidityService.finalizeWithdrawal(id)).resolves.toEqual(
        LiquidityError.AlreadyFinalized
      )
    })

    test("Can't finalize rolled back withdrawal", async (): Promise<void> => {
      const id = uuid()
      await expect(
        liquidityService.createWithdrawal({
          id,
          account,
          amount: BigInt(5)
        })
      ).resolves.toBeUndefined()
      await expect(
        liquidityService.rollbackWithdrawal(id)
      ).resolves.toBeUndefined()
      await expect(liquidityService.finalizeWithdrawal(id)).resolves.toEqual(
        LiquidityError.AlreadyRolledBack
      )
    })

    test("Can't rollback non-existent withdrawal", async (): Promise<void> => {
      await expect(
        liquidityService.rollbackWithdrawal(uuid())
      ).resolves.toEqual(LiquidityError.UnknownWithdrawal)
    })

    test("Can't rollback invalid withdrawal id", async (): Promise<void> => {
      const id = 'not a uuid v4'
      await expect(liquidityService.rollbackWithdrawal(id)).resolves.toEqual(
        LiquidityError.InvalidId
      )
    })

    test("Can't rollback finalized withdrawal", async (): Promise<void> => {
      const id = uuid()
      await expect(
        liquidityService.createWithdrawal({
          id,
          account,
          amount: BigInt(5)
        })
      ).resolves.toBeUndefined()
      await expect(
        liquidityService.finalizeWithdrawal(id)
      ).resolves.toBeUndefined()
      await expect(liquidityService.rollbackWithdrawal(id)).resolves.toEqual(
        LiquidityError.AlreadyFinalized
      )
    })

    test("Can't rollback rolled back withdrawal", async (): Promise<void> => {
      const id = uuid()
      await expect(
        liquidityService.createWithdrawal({
          id,
          account,
          amount: BigInt(5)
        })
      ).resolves.toBeUndefined()
      await expect(
        liquidityService.rollbackWithdrawal(id)
      ).resolves.toBeUndefined()
      await expect(liquidityService.rollbackWithdrawal(id)).resolves.toEqual(
        LiquidityError.AlreadyRolledBack
      )
    })
  })
})
