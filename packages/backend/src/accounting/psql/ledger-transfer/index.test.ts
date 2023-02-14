import { Knex } from 'knex'

import { createTestApp, TestContainer } from '../../../tests/app'
import { Config } from '../../../config/app'
import { initIocContainer } from '../../..'
import { Asset } from '../../../asset/model'
import { randomAsset } from '../../../tests/asset'
import { truncateTables } from '../../../tests/tableManager'
import { LedgerAccount } from '../ledger-account/model'
import { LedgerTransferState } from './model'
import { createLedgerAccount } from '../../../tests/ledgerAccount'
import { createLedgerTransfer } from '../../../tests/ledgerTransfer'
import { getAccountTransfers } from '.'
import { ServiceDependencies } from '../service'

describe('Ledger Transfer', (): void => {
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

  let creditAccount: LedgerAccount
  let debitAccount: LedgerAccount

  beforeEach(async (): Promise<void> => {
    asset = await Asset.query(knex).insertAndFetch(randomAsset())
    ;[creditAccount, debitAccount] = await Promise.all([
      createLedgerAccount({ ledger: asset.ledger }, knex),
      createLedgerAccount({ ledger: asset.ledger }, knex)
    ])
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('getAccountTransfers', (): void => {
    test.each`
      accountType
      ${'credit'}
      ${'debit'}
    `(
      `gets POSTED transfer for $accountType account `,
      async ({ accountType }): Promise<void> => {
        const transfer = await createLedgerTransfer(
          {
            ledger: creditAccount.ledger,
            creditAccountId: creditAccount.id,
            debitAccountId: debitAccount.id,
            state: LedgerTransferState.POSTED
          },
          knex
        )

        await expect(
          getAccountTransfers(
            serviceDeps,
            accountType === 'credit' ? creditAccount.id : debitAccount.id
          )
        ).resolves.toEqual(
          accountType === 'credit'
            ? { credits: [transfer], debits: [] }
            : { credits: [], debits: [transfer] }
        )
      }
    )

    test.each`
      accountType
      ${'credit'}
      ${'debit'}
    `(
      `gets PENDING transfer for $accountType account `,
      async ({ accountType }): Promise<void> => {
        const transfer = await createLedgerTransfer(
          {
            ledger: creditAccount.ledger,
            creditAccountId: creditAccount.id,
            debitAccountId: debitAccount.id,
            state: LedgerTransferState.PENDING
          },
          knex
        )

        await expect(
          getAccountTransfers(
            serviceDeps,
            accountType === 'credit' ? creditAccount.id : debitAccount.id
          )
        ).resolves.toEqual(
          accountType === 'credit'
            ? { credits: [transfer], debits: [] }
            : { credits: [], debits: [transfer] }
        )
      }
    )

    test.each`
      accountType
      ${'credit'}
      ${'debit'}
    `(
      `ignores expired transfer for $accountType account `,
      async ({ accountType }): Promise<void> => {
        await createLedgerTransfer(
          {
            ledger: creditAccount.ledger,
            creditAccountId: creditAccount.id,
            debitAccountId: debitAccount.id,
            state: LedgerTransferState.PENDING,
            expiresAt: new Date(Date.now() - 10)
          },
          knex
        )

        await expect(
          getAccountTransfers(
            serviceDeps,
            accountType === 'credit' ? creditAccount.id : debitAccount.id
          )
        ).resolves.toEqual({ credits: [], debits: [] })
      }
    )

    test.each`
      accountType
      ${'credit'}
      ${'debit'}
    `(
      `ignores VOIDED transfer for $accountType account `,
      async ({ accountType }): Promise<void> => {
        await createLedgerTransfer(
          {
            ledger: creditAccount.ledger,
            creditAccountId: creditAccount.id,
            debitAccountId: debitAccount.id,
            state: LedgerTransferState.VOIDED
          },
          knex
        )

        await expect(
          getAccountTransfers(
            serviceDeps,
            accountType === 'credit' ? creditAccount.id : debitAccount.id
          )
        ).resolves.toEqual({ credits: [], debits: [] })
      }
    )
  })
})
