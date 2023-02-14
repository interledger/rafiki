import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'
import { createTestApp, TestContainer } from '../../../tests/app'
import { Config } from '../../../config/app'
import { initIocContainer } from '../../..'
import { Asset } from '../../../asset/model'
import { randomAsset } from '../../../tests/asset'
import { truncateTables } from '../../../tests/tableManager'
import { LedgerAccount } from '../ledger-account/model'
import {
  LedgerTransfer,
  LedgerTransferState,
  LedgerTransferType
} from './model'
import { createLedgerAccount } from '../../../tests/ledgerAccount'
import { createLedgerTransfer } from '../../../tests/ledgerTransfer'
import { CreateTransferArgs, createTransfers, getAccountTransfers } from '.'
import { ServiceDependencies } from '../service'
import { ForeignKeyViolationError, UniqueViolationError } from 'objection'

describe('Ledger Transfer', (): void => {
  let serviceDeps: ServiceDependencies
  let appContainer: TestContainer
  let knex: Knex
  let asset: Asset

  beforeAll(async (): Promise<void> => {
    const deps = initIocContainer({ ...Config, useTigerbeetle: false })
    appContainer = await createTestApp(deps, { silentLogging: true })
    serviceDeps = {
      logger: await deps.use('logger'),
      knex: await deps.use('knex')
    }
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

  describe('createTransfers', (): void => {
    let baseTransfer: CreateTransferArgs

    beforeEach(async (): Promise<void> => {
      baseTransfer = {
        transferRef: uuid(),
        creditAccountId: creditAccount.id,
        debitAccountId: debitAccount.id,
        ledger: creditAccount.ledger,
        amount: 10n
      }
    })

    test.each`
      timeoutMs    | expectedState
      ${undefined} | ${LedgerTransferState.POSTED}
      ${1000n}     | ${LedgerTransferState.PENDING}
    `(
      'properly sets $expectedState state for $timeoutMs timeout',
      async ({
        timeoutMs,
        expectedState
      }: {
        timeoutMs: bigint
        expectedState: LedgerTransferState
      }): Promise<void> => {
        const transfer = {
          ...baseTransfer,
          timeoutMs,
          type: LedgerTransferType.DEPOSIT
        }

        const now = new Date()

        jest.useFakeTimers({ now })

        await expect(
          createTransfers(serviceDeps, [transfer], knex)
        ).resolves.toEqual([
          {
            id: expect.any(String),
            transferRef: transfer.transferRef,
            creditAccountId: creditAccount.id,
            debitAccountId: debitAccount.id,
            ledger: creditAccount.ledger,
            state: expectedState,
            amount: transfer.amount,
            type: transfer.type,
            expiresAt:
              timeoutMs != null
                ? new Date(now.getTime() + Number(timeoutMs))
                : null,
            createdAt: expect.any(Date),
            updatedAt: expect.any(Date)
          }
        ])
      }
    )

    test('throws if any transfer fails', async (): Promise<void> => {
      const transfer = {
        ...baseTransfer
      }

      const failTransfer = {
        ...baseTransfer,
        transferRef: uuid(),
        ledger: -1
      }

      await expect(
        createTransfers(serviceDeps, [transfer, failTransfer], knex)
      ).rejects.toThrow(ForeignKeyViolationError)

      await expect(
        LedgerTransfer.query(knex).findOne({
          transferRef: failTransfer.transferRef
        })
      ).resolves.toBeUndefined()

      await expect(
        LedgerTransfer.query(knex).findOne({
          transferRef: transfer.transferRef
        })
      ).resolves.toBeUndefined()
    })

    test('returns transferError if violates transferRef unique constraint', async (): Promise<void> => {
      const transfer = {
        ...baseTransfer
      }

      await expect(
        createTransfers(serviceDeps, [transfer, transfer], knex)
      ).rejects.toThrow(UniqueViolationError)
    })
  })
})
