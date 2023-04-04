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
    let account: LedgerAccount
    let peerAccount: LedgerAccount

    beforeEach(async (): Promise<void> => {
      asset = await Asset.query(knex).insertAndFetch(randomAsset())
      ;[account, peerAccount] = await Promise.all([
        createLedgerAccount({ ledger: asset.ledger }, knex),
        createLedgerAccount({ ledger: asset.ledger }, knex)
      ])
    })

    test('gets balances for account without transfers', async (): Promise<void> => {
      await expect(getAccountBalances(serviceDeps, account)).resolves.toEqual({
        creditsPosted: 0n,
        creditsPending: 0n,
        debitsPosted: 0n,
        debitsPending: 0n
      })
    })

    test('ignores voided transfers', async (): Promise<void> => {
      await createLedgerTransfer(
        {
          ledger: account.ledger,
          creditAccountId: account.id,
          debitAccountId: peerAccount.id,
          state: LedgerTransferState.VOIDED,
          amount: 10n
        },
        knex
      )

      await expect(getAccountBalances(serviceDeps, account)).resolves.toEqual({
        creditsPosted: 0n,
        creditsPending: 0n,
        debitsPosted: 0n,
        debitsPending: 0n
      })
    })

    describe('calculates balances for single transfers', (): void => {
      const amounts = {
        credit: {
          POSTED: 40n,
          PENDING: 30n
        },
        debit: {
          POSTED: 20n,
          PENDING: 10n
        }
      }

      for (const type of ['credit', 'debit']) {
        for (const state of [
          LedgerTransferState.POSTED,
          LedgerTransferState.PENDING
        ]) {
          test(`gets balances for ${state} ${type}s`, async (): Promise<void> => {
            await createLedgerTransfer(
              {
                ledger: account.ledger,
                creditAccountId:
                  type === 'credit' ? account.id : peerAccount.id,
                debitAccountId: type === 'credit' ? peerAccount.id : account.id,
                state,
                amount:
                  state === 'POSTED'
                    ? type === 'credit'
                      ? amounts.credit.POSTED
                      : amounts.debit.POSTED
                    : type === 'credit'
                    ? amounts.credit.PENDING
                    : amounts.debit.PENDING
              },
              knex
            )

            await expect(
              getAccountBalances(serviceDeps, account)
            ).resolves.toEqual({
              creditsPosted:
                type === 'credit' && state === LedgerTransferState.POSTED
                  ? amounts['credit']['POSTED']
                  : 0n,
              creditsPending:
                type === 'credit' && state === LedgerTransferState.PENDING
                  ? amounts['credit']['PENDING']
                  : 0n,
              debitsPosted:
                type === 'debit' && state === LedgerTransferState.POSTED
                  ? amounts['debit']['POSTED']
                  : 0n,
              debitsPending:
                type === 'debit' && state === LedgerTransferState.PENDING
                  ? amounts['debit']['PENDING']
                  : 0n
            })
          })
        }
      }
    })

    test('calculates balances for mixed transfers', async (): Promise<void> => {
      const amounts = {
        credit: {
          POSTED: 40n,
          PENDING: 30n
        },
        debit: {
          POSTED: 20n,
          PENDING: 10n
        }
      }

      const promises = []

      for (const type of ['credit', 'debit']) {
        for (const state of [
          LedgerTransferState.POSTED,
          LedgerTransferState.PENDING
        ]) {
          promises.push(
            createLedgerTransfer(
              {
                ledger: account.ledger,
                creditAccountId:
                  type === 'credit' ? account.id : peerAccount.id,
                debitAccountId: type === 'credit' ? peerAccount.id : account.id,
                state,
                amount:
                  state === 'POSTED'
                    ? type === 'credit'
                      ? amounts.credit.POSTED
                      : amounts.debit.POSTED
                    : type === 'credit'
                    ? amounts.credit.PENDING
                    : amounts.debit.PENDING
              },
              knex
            )
          )
        }
      }

      await Promise.all(promises)

      await expect(getAccountBalances(serviceDeps, account)).resolves.toEqual({
        creditsPosted: amounts['credit']['POSTED'],
        creditsPending: amounts['credit']['PENDING'],
        debitsPosted: amounts['debit']['POSTED'],
        debitsPending: amounts['debit']['PENDING']
      })
    })
  })
})
