import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { createTestApp, TestContainer } from '../../../tests/app'
import { LedgerAccountType } from './model'
import { Config } from '../../../config/app'
import { initIocContainer } from '../../..'
import { Asset } from '../../../asset/model'
import { randomAsset } from '../../../tests/asset'
import { truncateTables } from '../../../tests/tableManager'
import { AccountAlreadyExistsError } from '../../errors'
import { ForeignKeyViolationError } from 'objection'
import { createLedgerAccount } from '../../../tests/ledgerAccount'
import { ServiceDependencies } from '../service'
import { createAccount, getLiquidityAccount } from '.'

describe('Ledger Accounts', (): void => {
  let serviceDeps: ServiceDependencies
  let appContainer: TestContainer
  let knex: Knex
  let asset: Asset

  beforeAll(async (): Promise<void> => {
    const deps = initIocContainer({ ...Config, useTigerbeetle: false })
    appContainer = await createTestApp(deps)
    serviceDeps = { logger: await deps.use('logger') }
    knex = appContainer.knex
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

  describe('create', (): void => {
    test('creates ledger account', async (): Promise<void> => {
      const accountRef = uuid()
      const type = LedgerAccountType.LIQUIDITY_ASSET

      await expect(
        createAccount(serviceDeps, {
          ledger: asset.ledger,
          accountRef,
          type
        })
      ).resolves.toEqual({
        id: expect.any(String),
        accountRef,
        ledger: asset.ledger,
        type,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      })
    })

    test('throws if violates unique accountRef & type constraint', async (): Promise<void> => {
      const accountRef = uuid()
      const type = LedgerAccountType.SETTLEMENT

      await createLedgerAccount(
        {
          accountRef,
          ledger: asset.ledger,
          type
        },
        knex
      )

      await expect(
        createAccount(serviceDeps, {
          ledger: asset.ledger,
          accountRef,
          type
        })
      ).rejects.toThrow(AccountAlreadyExistsError)
    })

    test('throws if violates asset.ledger foreign key constraint', async (): Promise<void> => {
      await expect(
        createAccount(serviceDeps, {
          ledger: 9999,
          accountRef: uuid(),
          type: LedgerAccountType.SETTLEMENT
        })
      ).rejects.toThrow(ForeignKeyViolationError)
    })
  })

  describe('getLiquidityAccount', (): void => {
    test('gets account', async (): Promise<void> => {
      const accountRef = uuid()

      const account = await createLedgerAccount(
        {
          accountRef,
          ledger: asset.ledger,
          type: LedgerAccountType.LIQUIDITY_ASSET
        },
        knex
      )

      await expect(
        getLiquidityAccount(serviceDeps, accountRef)
      ).resolves.toEqual(account)
    })

    test('ignores settlement account', async (): Promise<void> => {
      const accountRef = uuid()

      await createLedgerAccount(
        {
          accountRef,
          ledger: asset.ledger,
          type: LedgerAccountType.SETTLEMENT
        },
        knex
      )

      await expect(
        getLiquidityAccount(serviceDeps, accountRef)
      ).resolves.toBeUndefined()
    })
  })
})
