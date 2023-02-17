import { Knex } from 'knex'
import { createTestApp, TestContainer } from '../../../tests/app'
import { Config } from '../../../config/app'
import { initIocContainer } from '../../..'
import { Asset } from '../../../asset/model'
import { randomAsset } from '../../../tests/asset'
import { truncateTables } from '../../../tests/tableManager'
import { LedgerAccount, LedgerAccountType } from '../ledger-account/model'
import { createLedgerAccount } from '../../../tests/ledgerAccount'
import { LedgerTransferState } from './model'
import { createLedgerTransfer } from '../../../tests/ledgerTransfer'

describe('Ledger Transfer Model', (): void => {
  let appContainer: TestContainer
  let knex: Knex
  let asset: Asset

  beforeAll(async (): Promise<void> => {
    const deps = initIocContainer({ ...Config, useTigerbeetle: false })
    appContainer = await createTestApp(deps, { silentLogging: true })
    knex = appContainer.knex
  })

  let creditAccount: LedgerAccount
  let debitAccount: LedgerAccount

  beforeEach(async (): Promise<void> => {
    asset = await Asset.query(knex).insertAndFetch(randomAsset())
    ;[creditAccount, debitAccount] = await Promise.all([
      createLedgerAccount({ ledger: asset.ledger }, knex),
      createLedgerAccount(
        {
          ledger: asset.ledger,
          type: LedgerAccountType.SETTLEMENT,
          accountRef: asset.id
        },
        knex
      )
    ])
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('isPosted', (): void => {
    test.each`
      state                          | result
      ${LedgerTransferState.PENDING} | ${false}
      ${LedgerTransferState.POSTED}  | ${true}
      ${LedgerTransferState.VOIDED}  | ${false}
    `(
      'isPosted is $result for $state state',
      async ({ state, result }): Promise<void> => {
        const transfer = await createLedgerTransfer(
          {
            ledger: creditAccount.ledger,
            creditAccountId: creditAccount.id,
            debitAccountId: debitAccount.id,
            state
          },
          knex
        )
        expect(transfer.isPosted).toEqual(result)
      }
    )
  })

  describe('isVoided', (): void => {
    test.each`
      state                          | result
      ${LedgerTransferState.PENDING} | ${false}
      ${LedgerTransferState.POSTED}  | ${false}
      ${LedgerTransferState.VOIDED}  | ${true}
    `(
      'isVoided is $result for $state state',
      async ({ state, result }): Promise<void> => {
        const transfer = await createLedgerTransfer(
          {
            ledger: creditAccount.ledger,
            creditAccountId: creditAccount.id,
            debitAccountId: debitAccount.id,
            state
          },
          knex
        )
        expect(transfer.isVoided).toEqual(result)
      }
    )
  })

  describe('isExpired', (): void => {
    const now = Date.now()

    describe.each`
      state
      ${LedgerTransferState.PENDING}
      ${LedgerTransferState.POSTED}
      ${LedgerTransferState.VOIDED}
    `('returns correct result for $state', ({ state }): void => {
      test.each`
        expiresAt            | description
        ${undefined}         | ${'not set'}
        ${new Date(now)}     | ${'now'}
        ${new Date(now + 1)} | ${'in the future'}
        ${new Date(now - 1)} | ${'in the past'}
      `('with expiresAt $description', async ({ expiresAt }): Promise<void> => {
        jest.useFakeTimers({ now })

        const transfer = await createLedgerTransfer(
          {
            ledger: creditAccount.ledger,
            creditAccountId: creditAccount.id,
            debitAccountId: debitAccount.id,
            state,
            expiresAt
          },
          knex
        )
        expect(transfer.isExpired).toEqual(
          state === LedgerTransferState.PENDING &&
            !!expiresAt &&
            expiresAt <= new Date(now)
        )
      })
    })
  })
})
