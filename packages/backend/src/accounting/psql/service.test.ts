import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'
import assert from 'assert'

import { createTestApp, TestContainer } from '../../tests/app'
import { Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../'
import { AppServices } from '../../app'
import { Asset } from '../../asset/model'
import { randomAsset } from '../../tests/asset'
import { truncateTables } from '../../tests/tableManager'
import {
  AccountingService,
  Deposit,
  LiquidityAccountType,
  Withdrawal
} from '../service'
import { LedgerAccount, LedgerAccountType } from './ledger-account/model'
import * as ledgerAccountFns from './ledger-account'
import { AccountAlreadyExistsError, TransferError } from '../errors'
import { createLedgerAccount } from '../../tests/ledgerAccount'
import { createLedgerTransfer } from '../../tests/ledgerTransfer'
import {
  LedgerTransfer,
  LedgerTransferState,
  LedgerTransferType
} from './ledger-transfer/model'

jest.mock('./ledger-account', () => {
  return {
    ...jest.requireActual('./ledger-account'),
    __esModule: true
  }
})

describe('Psql Accounting Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let accountingService: AccountingService
  let knex: Knex
  let asset: Asset

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({ ...Config, useTigerbeetle: false })
    appContainer = await createTestApp(deps, { silentLogging: true })
    knex = appContainer.knex
    accountingService = await deps.use('accountingService')
    accountingService
  })

  beforeEach(async (): Promise<void> => {
    asset = await Asset.query().insertAndFetch(randomAsset())
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('createLiquidityAccount', (): void => {
    test('creates account', async (): Promise<void> => {
      const account = {
        id: uuid(),
        asset
      }

      const createAccountSpy = jest.spyOn(ledgerAccountFns, 'createAccount')

      await expect(
        accountingService.createLiquidityAccount(
          account,
          LiquidityAccountType.ASSET
        )
      ).resolves.toEqual(account)
      expect(createAccountSpy.mock.results[0].value).resolves.toMatchObject({
        accountRef: account.id,
        type: LedgerAccountType.LIQUIDITY_ASSET,
        ledger: asset.ledger
      })
    })

    test('throws on error', async (): Promise<void> => {
      const account = {
        id: uuid(),
        asset
      }

      jest
        .spyOn(ledgerAccountFns, 'createAccount')
        .mockRejectedValueOnce(
          new AccountAlreadyExistsError('could not create account')
        )

      await expect(
        accountingService.createLiquidityAccount(
          account,
          LiquidityAccountType.ASSET
        )
      ).rejects.toThrowError(AccountAlreadyExistsError)
    })
  })

  describe('createSettlementAccount', (): void => {
    test('creates account', async (): Promise<void> => {
      const createAccountSpy = jest.spyOn(ledgerAccountFns, 'createAccount')

      await expect(
        accountingService.createSettlementAccount(asset.ledger)
      ).resolves.toBeUndefined()
      expect(createAccountSpy.mock.results[0].value).resolves.toMatchObject({
        accountRef: asset.id,
        type: LedgerAccountType.SETTLEMENT,
        ledger: asset.ledger
      })
    })

    test('throws if cannot find asset', async (): Promise<void> => {
      await expect(
        accountingService.createSettlementAccount(-1)
      ).rejects.toThrowError(/Could not find asset/)
    })

    test('throws on error', async (): Promise<void> => {
      jest
        .spyOn(ledgerAccountFns, 'createAccount')
        .mockRejectedValueOnce(new Error('could not create account'))

      await expect(
        accountingService.createSettlementAccount(asset.ledger)
      ).rejects.toThrowError('could not create account')
    })
  })

  describe('getBalance', (): void => {
    let account: LedgerAccount

    beforeEach(async (): Promise<void> => {
      account = await createLedgerAccount(
        {
          accountRef: asset.id,
          ledger: asset.ledger,
          type: LedgerAccountType.LIQUIDITY_INCOMING
        },
        knex
      )
    })

    test('gets balance for existing account', async (): Promise<void> => {
      await expect(
        accountingService.getBalance(account.accountRef)
      ).resolves.toBe(0n)
    })

    test('returns undefined for non-existing account', async (): Promise<void> => {
      await expect(
        accountingService.getBalance(uuid())
      ).resolves.toBeUndefined()
    })
  })

  describe('getTotalReceived', (): void => {
    test('gets total received for existing account', async (): Promise<void> => {
      const [settlementAccount, account] = await Promise.all([
        createLedgerAccount(
          {
            accountRef: asset.id,
            ledger: asset.ledger,
            type: LedgerAccountType.SETTLEMENT
          },
          knex
        ),
        createLedgerAccount({ ledger: asset.ledger }, knex)
      ])

      const amount = 10n

      await createLedgerTransfer(
        {
          debitAccountId: settlementAccount.id,
          creditAccountId: account.id,
          ledger: settlementAccount.ledger,
          type: LedgerTransferType.DEPOSIT,
          amount
        },
        knex
      )

      await expect(
        accountingService.getTotalReceived(account.accountRef)
      ).resolves.toBe(amount)
    })

    test('returns undefined for non-existing account', async (): Promise<void> => {
      await expect(
        accountingService.getTotalReceived(uuid())
      ).resolves.toBeUndefined()
    })
  })

  describe('getAccountsTotalReceived', (): void => {
    test('gets total received for existing accounts', async (): Promise<void> => {
      const [settlementAccount, account1, account2] = await Promise.all([
        createLedgerAccount(
          {
            accountRef: asset.id,
            ledger: asset.ledger,
            type: LedgerAccountType.SETTLEMENT
          },
          knex
        ),
        createLedgerAccount({ ledger: asset.ledger }, knex),
        createLedgerAccount({ ledger: asset.ledger }, knex)
      ])

      await Promise.all(
        [account1, account2].map((account) =>
          createLedgerTransfer(
            {
              debitAccountId: settlementAccount.id,
              creditAccountId: account.id,
              ledger: settlementAccount.ledger,
              type: LedgerTransferType.DEPOSIT,
              amount: 10n
            },
            knex
          )
        )
      )

      const accountRefs = [account1, account2]
        .map(({ accountRef }) => accountRef)
        .concat([uuid()])

      await expect(
        accountingService.getAccountsTotalReceived(accountRefs)
      ).resolves.toEqual([10n, 10n, undefined])
    })

    test('returns empty array for non-existing accounts', async (): Promise<void> => {
      await expect(
        accountingService.getAccountsTotalReceived([uuid(), uuid()])
      ).resolves.toEqual([])
    })
  })

  describe('getTotalSent', (): void => {
    test('gets total sent for existing account', async (): Promise<void> => {
      const [settlementAccount, account] = await Promise.all([
        createLedgerAccount(
          {
            accountRef: asset.id,
            ledger: asset.ledger,
            type: LedgerAccountType.SETTLEMENT
          },
          knex
        ),
        createLedgerAccount({ ledger: asset.ledger }, knex)
      ])

      await createLedgerTransfer(
        {
          debitAccountId: account.id,
          creditAccountId: settlementAccount.id,
          ledger: settlementAccount.ledger,
          type: LedgerTransferType.DEPOSIT,
          amount: 10n
        },
        knex
      )

      await expect(
        accountingService.getTotalSent(account.accountRef)
      ).resolves.toBe(10n)
    })

    test('returns undefined for non-existing account', async (): Promise<void> => {
      await expect(
        accountingService.getTotalSent(uuid())
      ).resolves.toBeUndefined()
    })
  })

  describe('getAccountsTotalSent', (): void => {
    test('gets total Sent for existing accounts', async (): Promise<void> => {
      const [settlementAccount, account1, account2] = await Promise.all([
        createLedgerAccount(
          {
            accountRef: asset.id,
            ledger: asset.ledger,
            type: LedgerAccountType.SETTLEMENT
          },
          knex
        ),
        createLedgerAccount({ ledger: asset.ledger }, knex),
        createLedgerAccount({ ledger: asset.ledger }, knex)
      ])

      await Promise.all(
        [account1, account2].map((account) =>
          createLedgerTransfer(
            {
              creditAccountId: settlementAccount.id,
              debitAccountId: account.id,
              ledger: settlementAccount.ledger,
              type: LedgerTransferType.WITHDRAWAL,
              amount: 10n
            },
            knex
          )
        )
      )

      const accountRefs = [account1, account2]
        .map(({ accountRef }) => accountRef)
        .concat([uuid()])

      await expect(
        accountingService.getAccountsTotalSent(accountRefs)
      ).resolves.toEqual([10n, 10n, undefined])
    })

    test('returns empty array for non-existing accounts', async (): Promise<void> => {
      await expect(
        accountingService.getAccountsTotalSent([uuid(), uuid()])
      ).resolves.toEqual([])
    })
  })

  describe('getSettlementBalance', (): void => {
    test('gets settlement balance', async (): Promise<void> => {
      const [settlementAccount, account] = await Promise.all([
        createLedgerAccount(
          {
            accountRef: asset.id,
            ledger: asset.ledger,
            type: LedgerAccountType.SETTLEMENT
          },
          knex
        ),
        createLedgerAccount({ ledger: asset.ledger }, knex)
      ])

      await createLedgerTransfer(
        {
          debitAccountId: settlementAccount.id,
          creditAccountId: account.id,
          ledger: settlementAccount.ledger,
          type: LedgerTransferType.DEPOSIT,
          amount: 10n
        },
        knex
      )

      await expect(
        accountingService.getSettlementBalance(settlementAccount.ledger)
      ).resolves.toBe(10n)
    })

    test('returns undefined for non-existing ledger value', async (): Promise<void> => {
      await expect(
        accountingService.getSettlementBalance(-1)
      ).resolves.toBeUndefined()
    })

    test('returns undefined for incorrect accountRef', async (): Promise<void> => {
      const settlementAccount = await createLedgerAccount(
        {
          accountRef: uuid(),
          ledger: asset.ledger,
          type: LedgerAccountType.SETTLEMENT
        },
        knex
      )

      await expect(
        accountingService.getSettlementBalance(settlementAccount.ledger)
      ).resolves.toBeUndefined()
    })
  })

  describe('createAccountDeposit', (): void => {
    let account: LedgerAccount
    let deposit: Deposit

    beforeEach(async (): Promise<void> => {
      ;[, account] = await Promise.all([
        createLedgerAccount(
          {
            accountRef: asset.id,
            ledger: asset.ledger,
            type: LedgerAccountType.SETTLEMENT
          },
          knex
        ),
        createLedgerAccount({ ledger: asset.ledger }, knex)
      ])

      deposit = {
        id: uuid(),
        account: {
          id: account.accountRef,
          asset
        },
        amount: 10n
      }

      await expect(
        accountingService.getBalance(account.accountRef)
      ).resolves.toEqual(0n)
      await expect(
        accountingService.getSettlementBalance(account.ledger)
      ).resolves.toEqual(0n)
    })

    test('creates deposit', async (): Promise<void> => {
      await expect(
        accountingService.createDeposit(deposit)
      ).resolves.toBeUndefined()
      await expect(
        accountingService.getBalance(deposit.account.id)
      ).resolves.toEqual(deposit.amount)
      await expect(
        accountingService.getSettlementBalance(deposit.account.asset.ledger)
      ).resolves.toEqual(deposit.amount)
    })

    test('creates multiple deposits', async (): Promise<void> => {
      const deposits = [
        { ...deposit, id: uuid(), amount: 10n },
        { ...deposit, id: uuid(), amount: 20n }
      ]

      await expect(
        accountingService.createDeposit(deposits[0])
      ).resolves.toBeUndefined()
      await expect(
        accountingService.createDeposit(deposits[1])
      ).resolves.toBeUndefined()
      await expect(
        accountingService.getBalance(deposits[0].account.id)
      ).resolves.toEqual(30n)
      await expect(
        accountingService.getSettlementBalance(deposits[0].account.asset.ledger)
      ).resolves.toEqual(30n)
    })

    test('cannot deposit to unknown account', async (): Promise<void> => {
      deposit.account.id = uuid()
      await expect(accountingService.createDeposit(deposit)).resolves.toEqual(
        TransferError.UnknownDestinationAccount
      )
    })

    test('cannot deposit from unknown settlement account', async (): Promise<void> => {
      deposit.account.asset.id = uuid()
      await expect(accountingService.createDeposit(deposit)).resolves.toEqual(
        TransferError.UnknownSourceAccount
      )
    })

    test('cannot deposit zero', async (): Promise<void> => {
      deposit.amount = 0n
      await expect(accountingService.createDeposit(deposit)).resolves.toEqual(
        TransferError.InvalidAmount
      )
    })

    test('cannot create duplicate deposit', async (): Promise<void> => {
      await expect(
        accountingService.createDeposit(deposit)
      ).resolves.toBeUndefined()

      await expect(accountingService.createDeposit(deposit)).resolves.toEqual(
        TransferError.TransferExists
      )

      deposit.amount = 5n
      await expect(accountingService.createDeposit(deposit)).resolves.toEqual(
        TransferError.TransferExists
      )
    })

    test('cannot deposit negative amount', async (): Promise<void> => {
      deposit.amount = -10n
      await expect(accountingService.createDeposit(deposit)).resolves.toEqual(
        TransferError.InvalidAmount
      )
    })
  })

  describe('createWithdrawal', (): void => {
    let withdrawal: Withdrawal
    let account: LedgerAccount

    const startingBalance = 10n
    const timeout = 10_000n

    beforeEach(async (): Promise<void> => {
      ;[, account] = await Promise.all([
        createLedgerAccount(
          {
            accountRef: asset.id,
            ledger: asset.ledger,
            type: LedgerAccountType.SETTLEMENT
          },
          knex
        ),
        createLedgerAccount({ ledger: asset.ledger }, knex)
      ])

      // fund account
      await accountingService.createDeposit({
        id: uuid(),
        amount: startingBalance,
        account: {
          id: account.accountRef,
          asset
        }
      })

      withdrawal = {
        id: uuid(),
        account: {
          id: account.accountRef,
          asset
        },
        amount: 1n,
        timeout
      }
      await expect(
        accountingService.getBalance(account.accountRef)
      ).resolves.toEqual(startingBalance)
      await expect(
        accountingService.getSettlementBalance(account.ledger)
      ).resolves.toEqual(startingBalance)
    })

    describe.each`
      timeout      | description
      ${undefined} | ${'single-phase'}
      ${timeout}   | ${'two-phase'}
    `('($description) withdrawal', ({ timeout }): void => {
      beforeEach((): void => {
        withdrawal.timeout = timeout
      })

      test('creates withdrawal', async (): Promise<void> => {
        await expect(
          accountingService.createWithdrawal(withdrawal)
        ).resolves.toBeUndefined()
        await expect(
          accountingService.getBalance(withdrawal.account.id)
        ).resolves.toEqual(startingBalance - withdrawal.amount)
        await expect(
          accountingService.getSettlementBalance(
            withdrawal.account.asset.ledger
          )
        ).resolves.toEqual(
          timeout ? startingBalance : startingBalance - withdrawal.amount
        )
      })

      test('creates multiple withdrawals', async (): Promise<void> => {
        const withdrawals = [
          { ...withdrawal, id: uuid(), amount: 1n },
          { ...withdrawal, id: uuid(), amount: 2n }
        ]

        await expect(
          accountingService.createWithdrawal(withdrawals[0])
        ).resolves.toBeUndefined()
        await expect(
          accountingService.createWithdrawal(withdrawals[1])
        ).resolves.toBeUndefined()
        await expect(
          accountingService.getBalance(withdrawal.account.id)
        ).resolves.toEqual(startingBalance - 3n)
        await expect(
          accountingService.getSettlementBalance(
            withdrawal.account.asset.ledger
          )
        ).resolves.toEqual(timeout ? startingBalance : startingBalance - 3n)
      })

      test('cannot create duplicate withdrawal', async (): Promise<void> => {
        await expect(
          accountingService.createWithdrawal(withdrawal)
        ).resolves.toBeUndefined()

        await expect(
          accountingService.createWithdrawal(withdrawal)
        ).resolves.toEqual(TransferError.TransferExists)

        withdrawal.amount = 2n
        await expect(
          accountingService.createWithdrawal(withdrawal)
        ).resolves.toEqual(TransferError.TransferExists)
      })

      test('cannot withdraw from unknown account', async (): Promise<void> => {
        withdrawal.account.id = uuid()
        await expect(
          accountingService.createWithdrawal(withdrawal)
        ).resolves.toEqual(TransferError.UnknownSourceAccount)
      })

      test('cannot withdraw into unknown settlement account', async (): Promise<void> => {
        withdrawal.account.asset.id = uuid()
        await expect(
          accountingService.createWithdrawal(withdrawal)
        ).resolves.toEqual(TransferError.UnknownDestinationAccount)
      })

      test('cannot withdraw zero', async (): Promise<void> => {
        withdrawal.amount = 0n
        await expect(
          accountingService.createWithdrawal(withdrawal)
        ).resolves.toEqual(TransferError.InvalidAmount)
      })

      test('cannot withdraw negative amount', async (): Promise<void> => {
        withdrawal.amount = -10n
        await expect(
          accountingService.createWithdrawal(withdrawal)
        ).resolves.toEqual(TransferError.InvalidAmount)
      })

      test('cannot create withdrawal exceeding account balance', async (): Promise<void> => {
        withdrawal.amount = startingBalance + 1n
        await expect(
          accountingService.createWithdrawal(withdrawal)
        ).resolves.toEqual(TransferError.InsufficientDebitBalance)
      })
    })
  })

  describe('voidWithdrawal', (): void => {
    let withdrawal: Withdrawal
    let account: LedgerAccount

    const startingBalance = 10n
    const timeout = 10_000n

    beforeEach(async (): Promise<void> => {
      ;[, account] = await Promise.all([
        createLedgerAccount(
          {
            accountRef: asset.id,
            ledger: asset.ledger,
            type: LedgerAccountType.SETTLEMENT
          },
          knex
        ),
        createLedgerAccount({ ledger: asset.ledger }, knex)
      ])

      withdrawal = {
        id: uuid(),
        account: {
          id: account.accountRef,
          asset
        },
        amount: 1n,
        timeout
      }

      // fund account
      await accountingService.createDeposit({
        id: uuid(),
        amount: startingBalance,
        account: {
          id: account.accountRef,
          asset
        }
      })
    })

    test('voids withdrawal', async (): Promise<void> => {
      await expect(
        accountingService.createWithdrawal(withdrawal)
      ).resolves.toBeUndefined()
      await expect(
        accountingService.getBalance(withdrawal.account.id)
      ).resolves.toEqual(startingBalance - withdrawal.amount)
      await expect(
        accountingService.getSettlementBalance(withdrawal.account.asset.ledger)
      ).resolves.toEqual(startingBalance)

      await expect(
        accountingService.voidWithdrawal(withdrawal.id)
      ).resolves.toBeUndefined()
      await expect(
        accountingService.getBalance(withdrawal.account.id)
      ).resolves.toEqual(startingBalance)
    })

    test('returns error if could not void transfer', async (): Promise<void> => {
      await expect(accountingService.voidWithdrawal(uuid())).resolves.toEqual(
        TransferError.UnknownTransfer
      )
    })
  })
})
