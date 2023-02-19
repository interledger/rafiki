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
  LiquidityAccount,
  LiquidityAccountType,
  Withdrawal
} from '../service'
import { LedgerAccount, LedgerAccountType } from './ledger-account/model'
import * as ledgerAccountFns from './ledger-account'
import {
  AccountAlreadyExistsError,
  isTransferError,
  TransferError
} from '../errors'
import { createLedgerAccount } from '../../tests/ledgerAccount'
import { createLedgerTransfer } from '../../tests/ledgerTransfer'
import { LedgerTransferType } from './ledger-transfer/model'
import { AccountFactory, FactoryAccount } from '../../tests/accountFactory'
import { AssetService } from '../../asset/service'
import { isAssetError } from '../../asset/errors'

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
    appContainer = await createTestApp(deps)
    knex = appContainer.knex
    accountingService = await deps.use('accountingService')
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

  describe('postWithdrawal', (): void => {
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

    test('posts withdrawal', async (): Promise<void> => {
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
        accountingService.postWithdrawal(withdrawal.id)
      ).resolves.toBeUndefined()
      await expect(
        accountingService.getBalance(withdrawal.account.id)
      ).resolves.toEqual(startingBalance - withdrawal.amount)
    })

    test('returns error if could not post transfer', async (): Promise<void> => {
      await expect(accountingService.postWithdrawal(uuid())).resolves.toEqual(
        TransferError.UnknownTransfer
      )
    })
  })

  describe('createTransfer', (): void => {
    let accountFactory: AccountFactory
    let assetService: AssetService

    beforeAll(async () => {
      accountFactory = new AccountFactory(accountingService)
      assetService = await deps.use('assetService')
    })

    describe.each`
      sameAsset | description
      ${true}   | ${'same asset'}
      ${false}  | ${'cross-currency'}
    `('$description', ({ sameAsset }): void => {
      let sourceAccount: LiquidityAccount
      let destinationAccount: FactoryAccount
      const startingSourceBalance = 10n
      const startingDestinationLiquidity = 100n
      const timeout = 10_000n // 10 seconds

      beforeEach(async (): Promise<void> => {
        const sourceAsset = await assetService.create(randomAsset())
        assert.ok(!isAssetError(sourceAsset))

        sourceAccount = await accountFactory.build({
          balance: startingSourceBalance,
          asset: sourceAsset
        })

        const destinationAsset = sameAsset
          ? sourceAsset
          : await assetService.create(randomAsset())

        assert.ok(!isAssetError(destinationAsset))

        destinationAccount = await accountFactory.build({
          asset: destinationAsset
        })

        await expect(
          accountingService.createDeposit({
            id: uuid(),
            account: destinationAccount.asset,
            amount: startingDestinationLiquidity
          })
        ).resolves.toBeUndefined()
      })

      describe.each`
        sourceAmount | destinationAmount | description
        ${1n}        | ${1n}             | ${'same amount'}
        ${1n}        | ${2n}             | ${'source < destination'}
        ${2n}        | ${1n}             | ${'destination < source'}
      `(
        '$description',
        ({
          sourceAmount,
          destinationAmount
        }: {
          sourceAmount: bigint
          destinationAmount: bigint
        }): void => {
          test.each`
            post     | description
            ${true}  | ${'post'}
            ${false} | ${'void'}
          `('$description', async ({ post }): Promise<void> => {
            const trxOrError = await accountingService.createTransfer({
              sourceAccount,
              destinationAccount,
              sourceAmount,
              destinationAmount,
              timeout
            })
            assert.ok(!isTransferError(trxOrError))

            const amountDiff = destinationAmount - sourceAmount

            await expect(
              accountingService.getBalance(sourceAccount.id)
            ).resolves.toEqual(startingSourceBalance - sourceAmount)

            if (sameAsset) {
              await expect(
                accountingService.getBalance(sourceAccount.asset.id)
              ).resolves.toEqual(
                sourceAmount < destinationAmount
                  ? startingDestinationLiquidity - amountDiff
                  : startingDestinationLiquidity
              )
            } else {
              await expect(
                accountingService.getBalance(sourceAccount.asset.id)
              ).resolves.toEqual(0n)

              await expect(
                accountingService.getBalance(destinationAccount.asset.id)
              ).resolves.toEqual(
                startingDestinationLiquidity - destinationAmount
              )
            }

            await expect(
              accountingService.getBalance(destinationAccount.id)
            ).resolves.toEqual(0n)

            if (post) {
              await expect(trxOrError.post()).resolves.toBeUndefined()
            } else {
              await expect(trxOrError.void()).resolves.toBeUndefined()
            }

            await expect(
              accountingService.getBalance(sourceAccount.id)
            ).resolves.toEqual(
              post
                ? startingSourceBalance - sourceAmount
                : startingSourceBalance
            )

            if (sameAsset) {
              await expect(
                accountingService.getBalance(sourceAccount.asset.id)
              ).resolves.toEqual(
                post
                  ? startingDestinationLiquidity - amountDiff
                  : startingDestinationLiquidity
              )
            } else {
              await expect(
                accountingService.getBalance(sourceAccount.asset.id)
              ).resolves.toEqual(post ? sourceAmount : 0n)

              await expect(
                accountingService.getBalance(destinationAccount.asset.id)
              ).resolves.toEqual(
                post
                  ? startingDestinationLiquidity - destinationAmount
                  : startingDestinationLiquidity
              )
            }

            await expect(
              accountingService.getBalance(destinationAccount.id)
            ).resolves.toEqual(post ? destinationAmount : 0n)

            await expect(trxOrError.post()).resolves.toEqual(
              post ? TransferError.AlreadyPosted : TransferError.AlreadyVoided
            )
            await expect(trxOrError.void()).resolves.toEqual(
              post ? TransferError.AlreadyPosted : TransferError.AlreadyVoided
            )
          })
        }
      )

      test('returns error for insufficient source balance', async (): Promise<void> => {
        const transfer = {
          sourceAccount,
          destinationAccount,
          sourceAmount: startingSourceBalance + 1n,
          destinationAmount: 5n,
          timeout
        }
        await expect(
          accountingService.createTransfer(transfer)
        ).resolves.toEqual(TransferError.InsufficientBalance)
        await expect(
          accountingService.getBalance(sourceAccount.id)
        ).resolves.toEqual(startingSourceBalance)
      })

      test('returns error for insufficient destination liquidity balance', async (): Promise<void> => {
        await expect(
          accountingService.createTransfer({
            sourceAccount,
            destinationAccount,
            sourceAmount: 1n,
            destinationAmount: startingDestinationLiquidity + 2n,
            timeout
          })
        ).resolves.toEqual(TransferError.InsufficientLiquidity)
      })

      test('returns error for same accounts', async (): Promise<void> => {
        await expect(
          accountingService.createTransfer({
            sourceAccount,
            destinationAccount: sourceAccount,
            sourceAmount: 5n,
            destinationAmount: 5n,
            timeout
          })
        ).resolves.toEqual(TransferError.SameAccounts)
      })

      test('returns error for invalid source amount', async (): Promise<void> => {
        await expect(
          accountingService.createTransfer({
            sourceAccount,
            destinationAccount,
            sourceAmount: 0n,
            destinationAmount: 1n,
            timeout
          })
        ).resolves.toEqual(TransferError.InvalidSourceAmount)

        await expect(
          accountingService.createTransfer({
            sourceAccount,
            destinationAccount,
            sourceAmount: -1n,
            destinationAmount: 1n,
            timeout
          })
        ).resolves.toEqual(TransferError.InvalidSourceAmount)
      })

      test('returns error for invalid destination amount', async (): Promise<void> => {
        await expect(
          accountingService.createTransfer({
            sourceAccount,
            destinationAccount,
            sourceAmount: 5n,
            destinationAmount: 0n,
            timeout
          })
        ).resolves.toEqual(TransferError.InvalidDestinationAmount)

        await expect(
          accountingService.createTransfer({
            sourceAccount,
            destinationAccount,
            sourceAmount: 5n,
            destinationAmount: -1n,
            timeout
          })
        ).resolves.toEqual(TransferError.InvalidDestinationAmount)
      })

      test.todo('returns error timed out transfer')
    })
  })
})
