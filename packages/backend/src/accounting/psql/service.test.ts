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
        accountingService.createSettlementAccount(999)
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
})
