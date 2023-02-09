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
import { LedgerAccountType } from './ledger-account/model'
import { AccountAlreadyExistsError } from '../errors'

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
        assetId: account.asset.id,
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
        assetId: account.asset.id,
        type: LedgerAccountType.LIQUIDITY_ASSET
      })
    })
  })

  describe('createSettlementAccount', (): void => {
    test('creates account', async (): Promise<void> => {
      const account = {
        id: uuid(),
        asset
      }

      const createAccountSpy = jest.spyOn(ledgerAccountService, 'create')

      await expect(
        accountingService.createSettlementAccount(account)
      ).resolves.toEqual(account)
      expect(createAccountSpy).toHaveBeenCalledWith({
        accountRef: account.asset.id,
        assetId: account.asset.id,
        type: LedgerAccountType.SETTLEMENT
      })
    })

    test('throws on error', async (): Promise<void> => {
      const account = {
        id: uuid(),
        asset
      }

      const createAccountSpy = jest
        .spyOn(ledgerAccountService, 'create')
        .mockRejectedValueOnce(new Error('could not create account'))

      await expect(
        accountingService.createSettlementAccount(account)
      ).rejects.toThrowError(Error)
      expect(createAccountSpy).toHaveBeenCalledWith({
        accountRef: account.asset.id,
        assetId: account.asset.id,
        type: LedgerAccountType.SETTLEMENT
      })
    })
  })
})
