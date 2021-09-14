import { Model } from 'objection'
import { Transaction } from 'knex'
import { v4 as uuid } from 'uuid'

import {
  WithdrawalService,
  isWithdrawalError,
  WithdrawalError
} from './service'
import { AccountsService } from '../accounts/service'
import { DepositService } from '../deposit/service'
import {
  AccountFactory,
  createTestServices,
  TestServices,
  randomAsset
} from '../testsHelpers'

describe('Withdrawal Service', (): void => {
  let accountsService: AccountsService
  let accountFactory: AccountFactory
  let depositService: DepositService
  let withdrawalService: WithdrawalService
  let services: TestServices
  let trx: Transaction

  beforeAll(
    async (): Promise<void> => {
      services = await createTestServices()
      ;({ withdrawalService, accountsService, depositService } = services)
      accountFactory = new AccountFactory(accountsService)
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

  describe('Account Withdraw', (): void => {
    test('Can withdraw from account', async (): Promise<void> => {
      const { id: accountId, asset } = await accountFactory.build()
      const startingBalance = BigInt(10)
      await depositService.create({
        accountId,
        amount: startingBalance
      })
      const amount = BigInt(5)
      const withdrawal = {
        accountId,
        amount
      }
      const withdrawalOrError = await withdrawalService.create(withdrawal)
      expect(isWithdrawalError(withdrawalOrError)).toEqual(false)
      if (isWithdrawalError(withdrawalOrError)) {
        fail()
      }
      expect(withdrawalOrError).toEqual({
        ...withdrawal,
        id: withdrawalOrError.id
      })
      await expect(
        accountsService.getAccountBalance(accountId)
      ).resolves.toMatchObject({ balance: startingBalance - amount })
      await expect(
        accountsService.getSettlementBalance(asset)
      ).resolves.toEqual(startingBalance)

      const error = await withdrawalService.finalize(withdrawalOrError.id)
      expect(error).toBeUndefined()
      await expect(
        accountsService.getAccountBalance(accountId)
      ).resolves.toMatchObject({
        balance: startingBalance - amount
      })
      await expect(
        accountsService.getSettlementBalance(asset)
      ).resolves.toEqual(startingBalance - amount)
    })

    test("Can't create withdrawal with invalid id", async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const error = await withdrawalService.create({
        id: 'not a uuid v4',
        accountId,
        amount: BigInt(5)
      })
      expect(isWithdrawalError(error)).toEqual(true)
      expect(error).toEqual(WithdrawalError.InvalidId)
    })

    test("Can't withdraw from nonexistent account", async (): Promise<void> => {
      const accountId = uuid()
      await expect(
        withdrawalService.create({
          accountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(WithdrawalError.UnknownAccount)
    })

    test('Returns error for insufficient balance', async (): Promise<void> => {
      const { id: accountId, asset } = await accountFactory.build()
      const startingBalance = BigInt(5)
      await depositService.create({
        accountId,
        amount: startingBalance
      })
      const amount = BigInt(10)
      await expect(
        withdrawalService.create({
          accountId,
          amount
        })
      ).resolves.toEqual(WithdrawalError.InsufficientBalance)
      await expect(
        accountsService.getAccountBalance(accountId)
      ).resolves.toMatchObject({ balance: startingBalance })
      const settlementBalance = await accountsService.getSettlementBalance(
        asset
      )
      expect(settlementBalance).toEqual(startingBalance)
    })

    test("Can't create withdrawal with duplicate id", async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      await depositService.create({
        accountId,
        amount: BigInt(10)
      })
      const amount = BigInt(5)
      const withdrawal = {
        id: uuid(),
        accountId,
        amount
      }
      await expect(withdrawalService.create(withdrawal)).resolves.toEqual(
        withdrawal
      )

      await expect(withdrawalService.create(withdrawal)).resolves.toEqual(
        WithdrawalError.WithdrawalExists
      )

      await expect(
        withdrawalService.create({
          ...withdrawal,
          amount: BigInt(1)
        })
      ).resolves.toEqual(WithdrawalError.WithdrawalExists)

      const { id: diffAccountId } = await accountFactory.build()
      await depositService.create({
        accountId: diffAccountId,
        amount
      })
      await expect(
        withdrawalService.create({
          ...withdrawal,
          accountId: diffAccountId
        })
      ).resolves.toEqual(WithdrawalError.WithdrawalExists)
    })

    test('Can rollback withdrawal', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const startingBalance = BigInt(10)
      await depositService.create({
        accountId,
        amount: startingBalance
      })
      const amount = BigInt(5)
      const withdrawal = {
        id: uuid(),
        accountId,
        amount
      }
      const withdrawalOrError = await withdrawalService.create(withdrawal)
      expect(isWithdrawalError(withdrawalOrError)).toEqual(false)
      const error = await withdrawalService.rollback(withdrawal.id)
      expect(error).toBeUndefined()
      await expect(
        accountsService.getAccountBalance(accountId)
      ).resolves.toMatchObject({ balance: startingBalance })
    })

    test("Can't finalize non-existent withdrawal", async (): Promise<void> => {
      const error = await withdrawalService.finalize(uuid())
      expect(isWithdrawalError(error)).toEqual(true)
      expect(error).toEqual(WithdrawalError.UnknownWithdrawal)
    })

    test("Can't finalize invalid withdrawal id", async (): Promise<void> => {
      const id = 'not a uuid v4'
      const error = await withdrawalService.finalize(id)
      expect(isWithdrawalError(error)).toEqual(true)
      expect(error).toEqual(WithdrawalError.InvalidId)
    })

    test("Can't finalize finalized withdrawal", async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const amount = BigInt(5)
      await depositService.create({
        accountId,
        amount
      })
      const withdrawal = {
        id: uuid(),
        accountId,
        amount
      }
      await expect(withdrawalService.create(withdrawal)).resolves.toEqual(
        withdrawal
      )
      await expect(
        withdrawalService.finalize(withdrawal.id)
      ).resolves.toBeUndefined()
      await expect(withdrawalService.finalize(withdrawal.id)).resolves.toEqual(
        WithdrawalError.AlreadyFinalized
      )
    })

    test("Can't finalize rolled back withdrawal", async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const amount = BigInt(5)
      await depositService.create({
        accountId,
        amount
      })
      const withdrawal = {
        id: uuid(),
        accountId,
        amount
      }
      await expect(withdrawalService.create(withdrawal)).resolves.toEqual(
        withdrawal
      )
      await expect(
        withdrawalService.rollback(withdrawal.id)
      ).resolves.toBeUndefined()
      await expect(withdrawalService.finalize(withdrawal.id)).resolves.toEqual(
        WithdrawalError.AlreadyRolledBack
      )
    })

    test("Can't rollback non-existent withdrawal", async (): Promise<void> => {
      const error = await withdrawalService.rollback(uuid())
      expect(isWithdrawalError(error)).toEqual(true)
      expect(error).toEqual(WithdrawalError.UnknownWithdrawal)
    })

    test("Can't rollback invalid withdrawal id", async (): Promise<void> => {
      const id = 'not a uuid v4'
      const error = await withdrawalService.rollback(id)
      expect(isWithdrawalError(error)).toEqual(true)
      expect(error).toEqual(WithdrawalError.InvalidId)
    })

    test("Can't rollback finalized withdrawal", async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const amount = BigInt(5)
      await depositService.create({
        accountId,
        amount
      })
      const withdrawal = {
        id: uuid(),
        accountId,
        amount
      }
      await expect(withdrawalService.create(withdrawal)).resolves.toEqual(
        withdrawal
      )
      await expect(
        withdrawalService.finalize(withdrawal.id)
      ).resolves.toBeUndefined()
      await expect(withdrawalService.rollback(withdrawal.id)).resolves.toEqual(
        WithdrawalError.AlreadyFinalized
      )
    })

    test("Can't rollback rolled back withdrawal", async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const amount = BigInt(5)
      await depositService.create({
        accountId,
        amount
      })
      const withdrawal = {
        id: uuid(),
        accountId,
        amount
      }
      await expect(withdrawalService.create(withdrawal)).resolves.toEqual(
        withdrawal
      )
      await expect(
        withdrawalService.rollback(withdrawal.id)
      ).resolves.toBeUndefined()
      await expect(withdrawalService.rollback(withdrawal.id)).resolves.toEqual(
        WithdrawalError.AlreadyRolledBack
      )
    })
  })

  describe('Withdraw liquidity', (): void => {
    test('Can withdraw liquidity account', async (): Promise<void> => {
      const asset = randomAsset()
      const startingBalance = BigInt(10)
      await depositService.createLiquidity({
        asset,
        amount: startingBalance
      })
      const amount = BigInt(5)
      {
        const error = await withdrawalService.createLiquidity({
          asset,
          amount
        })
        expect(error).toBeUndefined()
        const balance = await accountsService.getLiquidityBalance(asset)
        expect(balance).toEqual(startingBalance - amount)
        const settlementBalance = await accountsService.getSettlementBalance(
          asset
        )
        expect(settlementBalance).toEqual(startingBalance - amount)
      }
      const amount2 = BigInt(5)
      {
        const error = await withdrawalService.createLiquidity({
          asset,
          amount: amount2
        })
        expect(error).toBeUndefined()
        const balance = await accountsService.getLiquidityBalance(asset)
        expect(balance).toEqual(startingBalance - amount - amount2)
        const settlementBalance = await accountsService.getSettlementBalance(
          asset
        )
        expect(settlementBalance).toEqual(startingBalance - amount - amount2)
      }
    })

    test('Returns error for invalid id', async (): Promise<void> => {
      const error = await withdrawalService.createLiquidity({
        id: 'not a uuid v4',
        asset: randomAsset(),
        amount: BigInt(5)
      })
      expect(error).toEqual(WithdrawalError.InvalidId)
    })

    test('Can withdraw liquidity with idempotency key', async (): Promise<void> => {
      const asset = randomAsset()
      const startingBalance = BigInt(10)
      await depositService.createLiquidity({
        asset,
        amount: startingBalance
      })
      const amount = BigInt(5)
      const id = uuid()
      {
        const error = await withdrawalService.createLiquidity({
          asset,
          amount,
          id
        })
        expect(error).toBeUndefined()
        const balance = await accountsService.getLiquidityBalance(asset)
        expect(balance).toEqual(startingBalance - amount)
      }
      {
        const error = await withdrawalService.createLiquidity({
          asset,
          amount,
          id
        })
        expect(error).toEqual(WithdrawalError.WithdrawalExists)
        const balance = await accountsService.getLiquidityBalance(asset)
        expect(balance).toEqual(startingBalance - amount)
      }
    })

    test('Returns error for insufficient balance', async (): Promise<void> => {
      const asset = randomAsset()
      const startingBalance = BigInt(5)
      await depositService.createLiquidity({
        asset,
        amount: startingBalance
      })
      const amount = BigInt(10)
      await expect(
        withdrawalService.createLiquidity({
          asset,
          amount
        })
      ).resolves.toEqual(WithdrawalError.InsufficientLiquidity)

      const balance = await accountsService.getLiquidityBalance(asset)
      expect(balance).toEqual(startingBalance)
      const settlementBalance = await accountsService.getSettlementBalance(
        asset
      )
      expect(settlementBalance).toEqual(startingBalance)
    })

    test('Returns error for unknown asset', async (): Promise<void> => {
      const asset = randomAsset()
      const amount = BigInt(10)
      await expect(
        withdrawalService.createLiquidity({
          asset,
          amount
        })
      ).resolves.toEqual(WithdrawalError.UnknownAsset)
    })
  })
})
