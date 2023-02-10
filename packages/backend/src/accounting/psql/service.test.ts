import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { createTestApp, TestContainer } from '../../tests/app'
import { Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../'
import { AppServices } from '../../app'
import { Asset } from '../../asset/model'
import { randomAsset } from '../../tests/asset'
import { truncateTables } from '../../tests/tableManager'
import { AccountingService, LiquidityAccountType } from '../service'
import { LedgerAccountService } from './ledger-account/service'
import { LedgerAccount, LedgerAccountType } from './ledger-account/model'
import { AccountAlreadyExistsError } from '../errors'
import { createLedgerAccount } from '../../tests/ledgerAccount'
import { createLedgerTransfer } from '../../tests/ledgerTransfer'
import { LedgerTransferType } from './ledger-transfer/model'

describe('Psql Accounting Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let accountingService: AccountingService
  let ledgerAccountService: LedgerAccountService
  let knex: Knex

  let asset: Asset

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({ ...Config, useTigerbeetle: false })
    appContainer = await createTestApp(deps)
    knex = appContainer.knex
    accountingService = await deps.use('accountingService')
    ledgerAccountService = await deps.use('ledgerAccountService')
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

      const createAccountSpy = jest.spyOn(ledgerAccountService, 'create')

      await expect(
        accountingService.createLiquidityAccount(
          account,
          LiquidityAccountType.ASSET
        )
      ).resolves.toEqual(account)
      expect(createAccountSpy).toHaveBeenCalledWith({
        accountRef: account.id,
        ledger: asset.ledger,
        type: LedgerAccountType.LIQUIDITY_ASSET
      })
    })

    test('throws on error', async (): Promise<void> => {
      const account = {
        id: uuid(),
        asset
      }

      const createAccountSpy = jest
        .spyOn(ledgerAccountService, 'create')
        .mockRejectedValueOnce(
          new AccountAlreadyExistsError('could not create account')
        )

      await expect(
        accountingService.createLiquidityAccount(
          account,
          LiquidityAccountType.ASSET
        )
      ).rejects.toThrowError(AccountAlreadyExistsError)
      expect(createAccountSpy).toHaveBeenCalledWith({
        accountRef: account.id,
        ledger: asset.ledger,
        type: LedgerAccountType.LIQUIDITY_ASSET
      })
    })
  })

  describe('createSettlementAccount', (): void => {
    test('creates account', async (): Promise<void> => {
      const createAccountSpy = jest.spyOn(ledgerAccountService, 'create')

      await expect(
        accountingService.createSettlementAccount(asset.ledger)
      ).resolves.toBeUndefined()
      expect(createAccountSpy).toHaveBeenCalledWith({
        accountRef: asset.id,
        ledger: asset.ledger,
        type: LedgerAccountType.SETTLEMENT
      })
    })

    test('throws if cannot find asset', async (): Promise<void> => {
      await expect(
        accountingService.createSettlementAccount(-1)
      ).rejects.toThrowError(/Could not find asset/)
    })

    test('throws on error', async (): Promise<void> => {
      const createAccountSpy = jest
        .spyOn(ledgerAccountService, 'create')
        .mockRejectedValueOnce(new Error('could not create account'))

      await expect(
        accountingService.createSettlementAccount(asset.ledger)
      ).rejects.toThrowError(Error)
      expect(createAccountSpy).toHaveBeenCalledWith({
        accountRef: asset.id,
        ledger: asset.ledger,
        type: LedgerAccountType.SETTLEMENT
      })
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
})
