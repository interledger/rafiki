import { Model } from 'objection'
import Knex, { Transaction } from 'knex'
import { createClient, Client } from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'

import { Config } from '../config'
import { AccountFactory } from '../accounts/testsHelpers'
import { CreditService, createCreditService, CreditError } from './service'
import { createAssetService } from '../asset/service'
import { createBalanceService } from '../balance/service'
import { AccountsService } from '../accounts/service'

import { Logger } from '../logger/service'
import { createKnex } from '../Knex/service'

describe('Credit Service', (): void => {
  let creditService: CreditService
  let accountsService: AccountsService
  let accountFactory: AccountFactory
  let config: typeof Config
  let tbClient: Client
  let knex: Knex
  let trx: Transaction

  beforeAll(
    async (): Promise<void> => {
      config = Config
      tbClient = createClient({
        cluster_id: config.tigerbeetleClusterId,
        replica_addresses: config.tigerbeetleReplicaAddresses
      })
      knex = await createKnex(config.postgresUrl)
      const balanceService = createBalanceService({
        tbClient,
        logger: Logger
      })
      const assetService = createAssetService({
        balanceService,
        logger: Logger
      })
      creditService = createCreditService({
        balanceService,
        logger: Logger
      })
      accountsService = new AccountsService(
        assetService,
        balanceService,
        config,
        Logger
      )
      accountFactory = new AccountFactory(accountsService)
    }
  )

  beforeEach(
    async (): Promise<void> => {
      trx = await knex.transaction()
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
      await knex.destroy()
      tbClient.destroy()
    }
  )

  describe('Extend Credit', (): void => {
    test.each`
      autoApply
      ${undefined}
      ${false}
      ${true}
    `(
      'Can extend credit to sub-account { autoApply: $autoApply }',
      async ({ autoApply }): Promise<void> => {
        const { id: superAccountId } = await accountFactory.build()
        const { id: accountId } = await accountFactory.build({
          superAccountId: superAccountId
        })
        const { id: subAccountId } = await accountFactory.build({
          superAccountId: accountId
        })

        await expect(
          accountsService.getAccountBalance(superAccountId)
        ).resolves.toEqual({
          balance: BigInt(0),
          availableCredit: BigInt(0),
          creditExtended: BigInt(0),
          totalBorrowed: BigInt(0),
          totalLent: BigInt(0)
        })
        await expect(
          accountsService.getAccountBalance(accountId)
        ).resolves.toEqual({
          balance: BigInt(0),
          availableCredit: BigInt(0),
          creditExtended: BigInt(0),
          totalBorrowed: BigInt(0),
          totalLent: BigInt(0)
        })
        await expect(
          accountsService.getAccountBalance(subAccountId)
        ).resolves.toEqual({
          balance: BigInt(0),
          availableCredit: BigInt(0),
          creditExtended: BigInt(0),
          totalBorrowed: BigInt(0),
          totalLent: BigInt(0)
        })

        const depositAmount = BigInt(20)
        if (autoApply) {
          await accountsService.deposit({
            accountId: superAccountId,
            amount: depositAmount
          })
          await accountsService.deposit({
            accountId,
            amount: depositAmount
          })
        }

        const amount = BigInt(5)
        await expect(
          creditService.extend({
            accountId: superAccountId,
            subAccountId,
            amount,
            autoApply
          })
        ).resolves.toBeUndefined()

        await expect(
          accountsService.getAccountBalance(superAccountId)
        ).resolves.toEqual({
          balance: autoApply ? depositAmount - amount : BigInt(0),
          availableCredit: BigInt(0),
          creditExtended: autoApply ? BigInt(0) : amount,
          totalBorrowed: BigInt(0),
          totalLent: autoApply ? amount : BigInt(0)
        })
        await expect(
          accountsService.getAccountBalance(accountId)
        ).resolves.toEqual({
          balance: autoApply ? depositAmount : BigInt(0),
          availableCredit: autoApply ? BigInt(0) : amount,
          creditExtended: autoApply ? BigInt(0) : amount,
          totalBorrowed: autoApply ? amount : BigInt(0),
          totalLent: autoApply ? amount : BigInt(0)
        })
        const subAccountBalance = await accountsService.getAccountBalance(
          subAccountId
        )
        expect(subAccountBalance).toEqual({
          balance: autoApply ? amount : BigInt(0),
          availableCredit: autoApply ? BigInt(0) : amount,
          creditExtended: BigInt(0),
          totalBorrowed: autoApply ? amount : BigInt(0),
          totalLent: BigInt(0)
        })

        await expect(
          creditService.extend({
            accountId: superAccountId,
            subAccountId: accountId,
            amount,
            autoApply
          })
        ).resolves.toBeUndefined()

        const superAccountBalance = await accountsService.getAccountBalance(
          superAccountId
        )
        await expect(superAccountBalance).toEqual({
          balance: autoApply ? depositAmount - amount * 2n : BigInt(0),
          availableCredit: BigInt(0),
          creditExtended: autoApply ? BigInt(0) : amount * 2n,
          totalBorrowed: BigInt(0),
          totalLent: autoApply ? amount * 2n : BigInt(0)
        })
        await expect(
          accountsService.getAccountBalance(accountId)
        ).resolves.toEqual({
          balance: autoApply ? depositAmount + amount : BigInt(0),
          availableCredit: autoApply ? BigInt(0) : amount * 2n,
          creditExtended: autoApply ? BigInt(0) : amount,
          totalBorrowed: autoApply ? amount * 2n : BigInt(0),
          totalLent: autoApply ? amount : BigInt(0)
        })
        await expect(
          accountsService.getAccountBalance(subAccountId)
        ).resolves.toEqual(subAccountBalance)

        await expect(
          creditService.extend({
            accountId,
            subAccountId,
            amount,
            autoApply
          })
        ).resolves.toBeUndefined()

        await expect(
          accountsService.getAccountBalance(superAccountId)
        ).resolves.toEqual(superAccountBalance)
        await expect(
          accountsService.getAccountBalance(accountId)
        ).resolves.toEqual({
          balance: autoApply ? depositAmount : BigInt(0),
          availableCredit: autoApply ? BigInt(0) : amount * 2n,
          creditExtended: autoApply ? BigInt(0) : amount * 2n,
          totalBorrowed: autoApply ? amount * 2n : BigInt(0),
          totalLent: autoApply ? amount * 2n : BigInt(0)
        })
        await expect(
          accountsService.getAccountBalance(subAccountId)
        ).resolves.toEqual({
          balance: autoApply ? amount * 2n : BigInt(0),
          availableCredit: autoApply ? BigInt(0) : amount * 2n,
          creditExtended: BigInt(0),
          totalBorrowed: autoApply ? amount * 2n : BigInt(0),
          totalLent: BigInt(0)
        })
      }
    )

    test('Returns error for nonexistent account', async (): Promise<void> => {
      const { id: subAccountId } = await accountFactory.build()
      await expect(
        creditService.extend({
          accountId: uuid(),
          subAccountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnknownAccount)
    })

    test('Returns error for nonexistent sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      await expect(
        creditService.extend({
          accountId,
          subAccountId: uuid(),
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnknownSubAccount)
    })

    test('Returns error for unrelated sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build()
      await expect(
        creditService.extend({
          accountId,
          subAccountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnrelatedSubAccount)
    })

    test('Returns error for super sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })
      await expect(
        creditService.extend({
          accountId: subAccountId,
          subAccountId: accountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnrelatedSubAccount)
    })

    test('Returns error for same accounts', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      await expect(
        creditService.extend({
          accountId,
          subAccountId: accountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.SameAccounts)
    })

    test('Returns error for insufficient account balance', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      await expect(
        creditService.extend({
          accountId,
          subAccountId,
          amount: BigInt(10),
          autoApply: true
        })
      ).resolves.toEqual(CreditError.InsufficientBalance)

      await expect(
        accountsService.getAccountBalance(accountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: BigInt(0),
        creditExtended: BigInt(0),
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
      await expect(
        accountsService.getAccountBalance(subAccountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: BigInt(0),
        creditExtended: BigInt(0),
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
    })
  })

  describe('Utilize Credit', (): void => {
    test('Can utilize credit to sub-account', async (): Promise<void> => {
      const { id: superAccountId } = await accountFactory.build()
      const { id: accountId } = await accountFactory.build({
        superAccountId: superAccountId
      })
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const creditAmount = BigInt(10)
      await expect(
        creditService.extend({
          accountId: superAccountId,
          subAccountId,
          amount: creditAmount
        })
      ).resolves.toBeUndefined()
      await accountsService.deposit({
        accountId: superAccountId,
        amount: creditAmount
      })

      await expect(
        accountsService.getAccountBalance(superAccountId)
      ).resolves.toEqual({
        balance: creditAmount,
        availableCredit: BigInt(0),
        creditExtended: creditAmount,
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
      await expect(
        accountsService.getAccountBalance(accountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: creditAmount,
        creditExtended: creditAmount,
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
      await expect(
        accountsService.getAccountBalance(subAccountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: creditAmount,
        creditExtended: BigInt(0),
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })

      const amount = BigInt(5)
      await expect(
        creditService.utilize({
          accountId: superAccountId,
          subAccountId,
          amount
        })
      ).resolves.toBeUndefined()

      await expect(
        accountsService.getAccountBalance(superAccountId)
      ).resolves.toEqual({
        balance: creditAmount - amount,
        availableCredit: BigInt(0),
        creditExtended: creditAmount - amount,
        totalBorrowed: BigInt(0),
        totalLent: amount
      })
      await expect(
        accountsService.getAccountBalance(accountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: creditAmount - amount,
        creditExtended: creditAmount - amount,
        totalBorrowed: amount,
        totalLent: amount
      })
      await expect(
        accountsService.getAccountBalance(subAccountId)
      ).resolves.toEqual({
        balance: amount,
        availableCredit: creditAmount - amount,
        creditExtended: BigInt(0),
        totalBorrowed: amount,
        totalLent: BigInt(0)
      })
    })

    test('Returns error for nonexistent account', async (): Promise<void> => {
      const { id: subAccountId } = await accountFactory.build()
      await expect(
        creditService.utilize({
          accountId: uuid(),
          subAccountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnknownAccount)
    })

    test('Returns error for nonexistent sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      await expect(
        creditService.utilize({
          accountId,
          subAccountId: uuid(),
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnknownSubAccount)
    })

    test('Returns error for unrelated sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build()
      await expect(
        creditService.utilize({
          accountId,
          subAccountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnrelatedSubAccount)
    })

    test('Returns error for super sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })
      await expect(
        creditService.utilize({
          accountId: subAccountId,
          subAccountId: accountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnrelatedSubAccount)
    })

    test('Returns error for same accounts', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      await expect(
        creditService.utilize({
          accountId,
          subAccountId: accountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.SameAccounts)
    })

    test('Returns error for insufficient credit balance', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const creditAmount = BigInt(5)
      await expect(
        creditService.extend({
          accountId,
          subAccountId,
          amount: creditAmount
        })
      ).resolves.toBeUndefined()

      await expect(
        creditService.utilize({
          accountId,
          subAccountId,
          amount: BigInt(10)
        })
      ).resolves.toEqual(CreditError.InsufficientCredit)

      await expect(
        accountsService.getAccountBalance(accountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: BigInt(0),
        creditExtended: creditAmount,
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
      await expect(
        accountsService.getAccountBalance(subAccountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: creditAmount,
        creditExtended: BigInt(0),
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
    })

    test('Returns error for insufficient account balance', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const creditAmount = BigInt(10)
      await expect(
        creditService.extend({
          accountId,
          subAccountId,
          amount: creditAmount
        })
      ).resolves.toBeUndefined()

      const accountBalance = await accountsService.getAccountBalance(accountId)
      expect(accountBalance).toEqual({
        balance: BigInt(0),
        availableCredit: BigInt(0),
        creditExtended: creditAmount,
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
      const subAccountBalance = await accountsService.getAccountBalance(
        subAccountId
      )
      expect(subAccountBalance).toEqual({
        balance: BigInt(0),
        availableCredit: creditAmount,
        creditExtended: BigInt(0),
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })

      await expect(
        creditService.utilize({
          accountId,
          subAccountId,
          amount: creditAmount
        })
      ).resolves.toEqual(CreditError.InsufficientBalance)

      await expect(
        accountsService.getAccountBalance(accountId)
      ).resolves.toEqual(accountBalance)
      await expect(
        accountsService.getAccountBalance(subAccountId)
      ).resolves.toEqual(subAccountBalance)
    })
  })

  describe('Revoke Credit', (): void => {
    test('Can revoke credit to sub-account', async (): Promise<void> => {
      const { id: superAccountId } = await accountFactory.build()
      const { id: accountId } = await accountFactory.build({
        superAccountId: superAccountId
      })
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const creditAmount = BigInt(10)
      await expect(
        creditService.extend({
          accountId: superAccountId,
          subAccountId,
          amount: creditAmount
        })
      ).resolves.toBeUndefined()

      const amount = BigInt(5)
      await expect(
        creditService.revoke({
          accountId: superAccountId,
          subAccountId,
          amount
        })
      ).resolves.toBeUndefined()

      await expect(
        accountsService.getAccountBalance(superAccountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: BigInt(0),
        creditExtended: creditAmount - amount,
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
      await expect(
        accountsService.getAccountBalance(accountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: creditAmount - amount,
        creditExtended: creditAmount - amount,
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
      await expect(
        accountsService.getAccountBalance(subAccountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: creditAmount - amount,
        creditExtended: BigInt(0),
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
    })

    test('Returns error for nonexistent account', async (): Promise<void> => {
      const { id: subAccountId } = await accountFactory.build()
      await expect(
        creditService.revoke({
          accountId: uuid(),
          subAccountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnknownAccount)
    })

    test('Returns error for nonexistent sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      await expect(
        creditService.revoke({
          accountId,
          subAccountId: uuid(),
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnknownSubAccount)
    })

    test('Returns error for unrelated sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build()
      await expect(
        creditService.revoke({
          accountId,
          subAccountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnrelatedSubAccount)
    })

    test('Returns error for super sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })
      await expect(
        creditService.revoke({
          accountId: subAccountId,
          subAccountId: accountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnrelatedSubAccount)
    })

    test('Returns error for same accounts', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      await expect(
        creditService.revoke({
          accountId,
          subAccountId: accountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.SameAccounts)
    })

    test('Returns error for insufficient credit balance', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const creditAmount = BigInt(5)
      await expect(
        creditService.extend({
          accountId,
          subAccountId,
          amount: creditAmount
        })
      ).resolves.toBeUndefined()

      await expect(
        creditService.revoke({
          accountId,
          subAccountId,
          amount: BigInt(10)
        })
      ).resolves.toEqual(CreditError.InsufficientCredit)

      await expect(
        accountsService.getAccountBalance(accountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: BigInt(0),
        creditExtended: creditAmount,
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
      await expect(
        accountsService.getAccountBalance(subAccountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: creditAmount,
        creditExtended: BigInt(0),
        totalBorrowed: BigInt(0),
        totalLent: BigInt(0)
      })
    })
  })

  describe('Settle Debt', (): void => {
    test.each`
      revolve
      ${undefined}
      ${false}
      ${true}
    `(
      'Can settle sub-account debt { revolve: $revolve }',
      async ({ revolve }): Promise<void> => {
        const { id: superAccountId } = await accountFactory.build()
        const { id: accountId } = await accountFactory.build({
          superAccountId: superAccountId
        })
        const { id: subAccountId } = await accountFactory.build({
          superAccountId: accountId
        })

        const creditAmount = BigInt(10)
        await accountsService.deposit({
          accountId: superAccountId,
          amount: creditAmount
        })
        await expect(
          creditService.extend({
            accountId: superAccountId,
            subAccountId,
            amount: creditAmount,
            autoApply: true
          })
        ).resolves.toBeUndefined()

        const amount = BigInt(1)
        await expect(
          creditService.settleDebt({
            accountId: superAccountId,
            subAccountId,
            amount,
            revolve
          })
        ).resolves.toBeUndefined()

        await expect(
          accountsService.getAccountBalance(superAccountId)
        ).resolves.toEqual({
          balance: amount,
          availableCredit: BigInt(0),
          creditExtended: revolve === false ? BigInt(0) : amount,
          totalBorrowed: BigInt(0),
          totalLent: creditAmount - amount
        })
        await expect(
          accountsService.getAccountBalance(accountId)
        ).resolves.toEqual({
          balance: BigInt(0),
          availableCredit: revolve === false ? BigInt(0) : amount,
          creditExtended: revolve === false ? BigInt(0) : amount,
          totalBorrowed: creditAmount - amount,
          totalLent: creditAmount - amount
        })
        await expect(
          accountsService.getAccountBalance(subAccountId)
        ).resolves.toEqual({
          balance: creditAmount - amount,
          availableCredit: revolve === false ? BigInt(0) : amount,
          creditExtended: BigInt(0),
          totalBorrowed: creditAmount - amount,
          totalLent: BigInt(0)
        })
      }
    )

    test('Returns error for nonexistent account', async (): Promise<void> => {
      const { id: subAccountId } = await accountFactory.build()
      await expect(
        creditService.settleDebt({
          accountId: uuid(),
          subAccountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnknownAccount)
    })

    test('Returns error for nonexistent sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      await expect(
        creditService.settleDebt({
          accountId,
          subAccountId: uuid(),
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnknownSubAccount)
    })

    test('Returns error for unrelated sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build()
      await expect(
        creditService.settleDebt({
          accountId,
          subAccountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnrelatedSubAccount)
    })

    test('Returns error for super sub-account', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })
      await expect(
        creditService.settleDebt({
          accountId: subAccountId,
          subAccountId: accountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.UnrelatedSubAccount)
    })

    test('Returns error for same accounts', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      await expect(
        creditService.settleDebt({
          accountId,
          subAccountId: accountId,
          amount: BigInt(5)
        })
      ).resolves.toEqual(CreditError.SameAccounts)
    })

    test('Returns error if amount exceeds debt', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const lentAmount = BigInt(5)
      await accountsService.deposit({
        accountId,
        amount: lentAmount
      })
      await expect(
        creditService.extend({
          accountId,
          subAccountId,
          amount: lentAmount,
          autoApply: true
        })
      ).resolves.toBeUndefined()

      const depositAmount = BigInt(5)
      await accountsService.deposit({
        accountId: subAccountId,
        amount: depositAmount
      })

      await expect(
        creditService.settleDebt({
          accountId,
          subAccountId,
          amount: depositAmount + lentAmount
        })
      ).resolves.toEqual(CreditError.InsufficientDebt)

      await expect(
        accountsService.getAccountBalance(accountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: BigInt(0),
        creditExtended: BigInt(0),
        totalBorrowed: BigInt(0),
        totalLent: lentAmount
      })
      await expect(
        accountsService.getAccountBalance(subAccountId)
      ).resolves.toEqual({
        balance: depositAmount + lentAmount,
        availableCredit: BigInt(0),
        creditExtended: BigInt(0),
        totalBorrowed: lentAmount,
        totalLent: BigInt(0)
      })
    })

    test('Returns error for insufficient sub-account balance', async (): Promise<void> => {
      const { id: accountId } = await accountFactory.build()
      const { id: subAccountId } = await accountFactory.build({
        superAccountId: accountId
      })

      const lentAmount = BigInt(5)
      await accountsService.deposit({
        accountId,
        amount: lentAmount
      })
      await expect(
        creditService.extend({
          accountId,
          subAccountId,
          amount: lentAmount,
          autoApply: true
        })
      ).resolves.toBeUndefined()

      const withdrawAmount = BigInt(1)
      await accountsService.createWithdrawal({
        accountId: subAccountId,
        amount: withdrawAmount
      })

      await expect(
        creditService.settleDebt({
          accountId,
          subAccountId,
          amount: lentAmount
        })
      ).resolves.toEqual(CreditError.InsufficientBalance)

      await expect(
        accountsService.getAccountBalance(accountId)
      ).resolves.toEqual({
        balance: BigInt(0),
        availableCredit: BigInt(0),
        creditExtended: BigInt(0),
        totalBorrowed: BigInt(0),
        totalLent: lentAmount
      })
      await expect(
        accountsService.getAccountBalance(subAccountId)
      ).resolves.toEqual({
        balance: lentAmount - withdrawAmount,
        availableCredit: BigInt(0),
        creditExtended: BigInt(0),
        totalBorrowed: lentAmount,
        totalLent: BigInt(0)
      })
    })
  })
})
