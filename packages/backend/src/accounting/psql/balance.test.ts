import { Knex } from 'knex'

import { createTestApp, TestContainer } from '../../tests/app'
import { Config } from '../../config/app'
import { initIocContainer } from '../../'
import { Asset } from '../../asset/model'
import { randomAsset } from '../../tests/asset'
import { truncateTables } from '../../tests/tableManager'
import { LedgerAccount } from './ledger-account/model'
import { createLedgerAccount } from '../../tests/ledgerAccount'
import { getAccountBalances } from './balance'
import { ServiceDependencies } from './service'
import { createLedgerTransfer } from '../../tests/ledgerTransfer'
import { LedgerTransferState } from './ledger-transfer/model'

describe('Balances', (): void => {
  let serviceDeps: ServiceDependencies
  let appContainer: TestContainer
  let knex: Knex
  let asset: Asset

  beforeAll(async (): Promise<void> => {
    const deps = initIocContainer({ ...Config, useTigerbeetle: false })
    appContainer = await createTestApp(deps)
    serviceDeps = {
      logger: await deps.use('logger'),
      knex: await deps.use('knex')
    }
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

  describe('getAccountBalances', (): void => {
    let creditAccount: LedgerAccount
    let debitAccount: LedgerAccount

    beforeEach(async (): Promise<void> => {
      asset = await Asset.query(knex).insertAndFetch(randomAsset())
      ;[creditAccount, debitAccount] = await Promise.all([
        createLedgerAccount({ ledger: asset.ledger }, knex),
        createLedgerAccount({ ledger: asset.ledger }, knex)
      ])
    })

    test('gets balances for account without transfers', async (): Promise<void> => {
      await expect(
        getAccountBalances(serviceDeps, creditAccount)
      ).resolves.toEqual({
        creditsPosted: 0n,
        creditsPending: 0n,
        debitsPosted: 0n,
        debitsPending: 0n
      })
    })

    test('ignores voided transfers', async (): Promise<void> => {
      await createLedgerTransfer(
        {
          ledger: creditAccount.ledger,
          creditAccountId: creditAccount.id,
          debitAccountId: debitAccount.id,
          state: LedgerTransferState.VOIDED,
          amount: 10n
        },
        knex
      )

      await expect(
        getAccountBalances(serviceDeps, creditAccount)
      ).resolves.toEqual({
        creditsPosted: 0n,
        creditsPending: 0n,
        debitsPosted: 0n,
        debitsPending: 0n
      })
    })

    describe.each`
      accountType
      ${'credit'}
      ${'debit'}
    `(
      'for $accountType accounts',
      ({ accountType }: { accountType: 'credit' | 'debit' }): void => {
        test.each`
          state
          ${LedgerTransferState.POSTED}
          ${LedgerTransferState.PENDING}
        `(
          `gets balances for $state ${accountType}s`,
          async ({ state }: { state: LedgerTransferState }): Promise<void> => {
            const baseTransfer = {
              ledger: creditAccount.ledger,
              creditAccountId: creditAccount.id,
              debitAccountId: debitAccount.id,
              state
            }

            await Promise.all([
              createLedgerTransfer({ ...baseTransfer, amount: 10n }, knex),
              createLedgerTransfer({ ...baseTransfer, amount: 20n }, knex)
            ])

            await expect(
              getAccountBalances(
                serviceDeps,
                accountType === 'credit' ? creditAccount : debitAccount
              )
            ).resolves.toEqual({
              creditsPosted:
                accountType === 'credit' && state === LedgerTransferState.POSTED
                  ? 30n
                  : 0n,
              creditsPending:
                accountType === 'credit' &&
                state === LedgerTransferState.PENDING
                  ? 30n
                  : 0n,
              debitsPosted:
                accountType === 'debit' && state === LedgerTransferState.POSTED
                  ? 30n
                  : 0n,
              debitsPending:
                accountType === 'debit' && state === LedgerTransferState.PENDING
                  ? 30n
                  : 0n
            })
          }
        )
      }
    )
  })
})
