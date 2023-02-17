import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'
import { createTestApp, TestContainer } from '../../../tests/app'
import { Config } from '../../../config/app'
import { initIocContainer } from '../../..'
import { Asset } from '../../../asset/model'
import { randomAsset } from '../../../tests/asset'
import { truncateTables } from '../../../tests/tableManager'
import { LedgerAccount, LedgerAccountType } from '../ledger-account/model'
import {
  LedgerTransfer,
  LedgerTransferState,
  LedgerTransferType
} from './model'
import { createLedgerAccount } from '../../../tests/ledgerAccount'
import { createLedgerTransfer } from '../../../tests/ledgerTransfer'
import {
  CreateTransferArgs,
  createTransfers,
  getAccountTransfers,
  hasEnoughDebitBalance,
  hasEnoughCreditBalance,
  postTransfer,
  voidTransfer
} from '.'
import { ServiceDependencies } from '../service'
import { TransferError } from '../../errors'

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

  let account: LedgerAccount
  let peerAccount: LedgerAccount
  let settlementAccount: LedgerAccount

  beforeEach(async (): Promise<void> => {
    asset = await Asset.query(knex).insertAndFetch(randomAsset())
    ;[account, peerAccount, settlementAccount] = await Promise.all([
      createLedgerAccount({ ledger: asset.ledger }, knex),
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

  describe('createTransfers', (): void => {
    let baseTransfer: CreateTransferArgs
    let totalAssetSettlementBalance: bigint

    const accountStartingBalance = 100n

    beforeEach(async (): Promise<void> => {
      const accounts = [account, peerAccount]

      baseTransfer = {
        transferRef: uuid(),
        creditAccount: account,
        debitAccount: peerAccount,
        amount: 10n
      }

      // Fund accounts
      await Promise.all(
        accounts.map((account) =>
          createLedgerTransfer(
            {
              creditAccountId: account.id,
              debitAccountId: settlementAccount.id,
              amount: accountStartingBalance,
              ledger: account.ledger
            },
            knex
          )
        )
      )

      totalAssetSettlementBalance =
        BigInt(accounts.length) * accountStartingBalance
    })

    test.each`
      timeoutMs    | expectedState                  | description
      ${undefined} | ${LedgerTransferState.POSTED}  | ${'without timeout'}
      ${1000n}     | ${LedgerTransferState.PENDING} | ${'with defined timeout'}
    `(
      'properly creates $expectedState transfer $description',
      async ({
        timeoutMs,
        expectedState
      }: {
        timeoutMs: bigint
        expectedState: LedgerTransferState
      }): Promise<void> => {
        const transfer: CreateTransferArgs = {
          ...baseTransfer,
          timeoutMs,
          type: LedgerTransferType.DEPOSIT
        }

        const now = new Date()

        jest.useFakeTimers({ now })

        await expect(createTransfers(serviceDeps, [transfer])).resolves.toEqual(
          {
            results: [
              {
                id: expect.any(String),
                transferRef: transfer.transferRef,
                creditAccountId: transfer.creditAccount.id,
                debitAccountId: transfer.debitAccount.id,
                ledger: transfer.creditAccount.ledger,
                state: expectedState,
                amount: transfer.amount,
                type: transfer.type,
                expiresAt: timeoutMs
                  ? new Date(now.getTime() + Number(timeoutMs))
                  : null,
                createdAt: expect.any(Date),
                updatedAt: expect.any(Date)
              }
            ],
            errors: []
          }
        )
      }
    )

    test('returns error if duplicate transfer (on unique transferRef constraint)', async (): Promise<void> => {
      await expect(
        createTransfers(serviceDeps, [baseTransfer, baseTransfer])
      ).resolves.toEqual({
        results: [],
        errors: [{ index: 1, error: TransferError.TransferExists }]
      })
    })

    test.todo('throws if unhandled error during insert')

    test.each`
      amount | description
      ${0n}  | ${'zero'}
      ${-1n} | ${'negative'}
    `(
      'returns error for invalid amount ($description)',
      async ({ amount }: { amount: bigint }): Promise<void> => {
        const transfer: CreateTransferArgs = {
          ...baseTransfer,
          amount
        }

        await expect(createTransfers(serviceDeps, [transfer])).resolves.toEqual(
          {
            results: [],
            errors: [{ index: 0, error: TransferError.InvalidAmount }]
          }
        )
      }
    )

    test('returns error for mismatched account assets', async (): Promise<void> => {
      const transfer: CreateTransferArgs = {
        ...baseTransfer
      }

      transfer.creditAccount['ledger' as string] = 1
      transfer.debitAccount['ledger' as string] = 0

      await expect(createTransfers(serviceDeps, [transfer])).resolves.toEqual({
        results: [],
        errors: [{ index: 0, error: TransferError.DifferentAssets }]
      })
    })

    test('returns error if same account transfer', async (): Promise<void> => {
      const transfer: CreateTransferArgs = {
        ...baseTransfer,
        creditAccount: account,
        debitAccount: account
      }

      await expect(createTransfers(serviceDeps, [transfer])).resolves.toEqual({
        results: [],
        errors: [{ index: 0, error: TransferError.SameAccounts }]
      })
    })

    test('returns error if transferRef not uuid', async (): Promise<void> => {
      const transfer: CreateTransferArgs = {
        ...baseTransfer,
        transferRef: ''
      }

      await expect(createTransfers(serviceDeps, [transfer])).resolves.toEqual({
        results: [],
        errors: [{ index: 0, error: TransferError.InvalidId }]
      })
    })

    test('returns error for negative timeout value', async (): Promise<void> => {
      const transfer: CreateTransferArgs = {
        ...baseTransfer,
        timeoutMs: -1n
      }

      await expect(createTransfers(serviceDeps, [transfer])).resolves.toEqual({
        results: [],
        errors: [{ index: 0, error: TransferError.InvalidTimeout }]
      })
    })

    test('does not create transfers if any fail', async (): Promise<void> => {
      const transfer: CreateTransferArgs = {
        ...baseTransfer
      }

      const failTransfer: CreateTransferArgs = {
        ...baseTransfer,
        transferRef: uuid(),
        creditAccount: account,
        debitAccount: account
      }

      await expect(
        createTransfers(serviceDeps, [transfer, failTransfer])
      ).resolves.toEqual({
        results: [],
        errors: [{ index: 1, error: TransferError.SameAccounts }]
      })

      const accountTransfers = await getAccountTransfers(
        serviceDeps,
        account.id,
        knex
      )

      const transferRefs = [
        ...accountTransfers.credits,
        ...accountTransfers.debits
      ].map((transfer) => transfer.transferRef)

      expect(transferRefs).not.toContain(transfer.transferRef)
      expect(transferRefs).not.toContain(failTransfer.transferRef)
    })

    test('returns error if not enough balance', async (): Promise<void> => {
      const transfer: CreateTransferArgs = {
        ...baseTransfer,
        amount: accountStartingBalance + 1n
      }

      await expect(createTransfers(serviceDeps, [transfer])).resolves.toEqual({
        results: [],
        errors: [{ index: 0, error: TransferError.InsufficientBalance }]
      })
    })

    test('returns error if not enough debit balance', async (): Promise<void> => {
      const transfer: CreateTransferArgs = {
        ...baseTransfer,
        creditAccount: settlementAccount,
        amount: totalAssetSettlementBalance + 1n
      }

      await expect(createTransfers(serviceDeps, [transfer])).resolves.toEqual({
        results: [],
        errors: [{ index: 0, error: TransferError.InsufficientDebitBalance }]
      })
    })
  })

  describe('hasEnoughCreditBalance', (): void => {
    test.each`
      description                                                                 | isSettlementAccount | transferAmount | creditsPosted | creditsPending | debitsPosted | debitsPending | result
      ${'passes if settlement account'}                                           | ${true}             | ${10n}         | ${0n}         | ${0n}          | ${0n}        | ${0n}         | ${true}
      ${'passes if posted credits surpass transfer amount'}                       | ${false}            | ${10n}         | ${11n}        | ${0n}          | ${0n}        | ${0n}         | ${true}
      ${'passes if posted credits equal transfer amount'}                         | ${false}            | ${10n}         | ${10n}        | ${0n}          | ${0n}        | ${0n}         | ${true}
      ${'passes if posted credits equal transfer amount and all debits'}          | ${false}            | ${6n}          | ${10n}        | ${0n}          | ${2n}        | ${2n}         | ${true}
      ${'fails if posted credits below transfer amount'}                          | ${false}            | ${11n}         | ${10n}        | ${0n}          | ${0n}        | ${0n}         | ${false}
      ${'fails if posted credits below transfer amount, ignores pending credits'} | ${false}            | ${11n}         | ${10n}        | ${10n}         | ${0n}        | ${0n}         | ${false}
      ${'fails if posted credits below transfer amount and posted debits'}        | ${false}            | ${5n}          | ${10n}        | ${0n}          | ${6n}        | ${0n}         | ${false}
      ${'fails if posted credits below transfer amount and pending debits'}       | ${false}            | ${5n}          | ${10n}        | ${0n}          | ${0n}        | ${6n}         | ${false}
      ${'fails if posted credits below transfer amount and all debits'}           | ${false}            | ${5n}          | ${10n}        | ${0n}          | ${3n}        | ${3n}         | ${false}
    `(
      '$description',
      async ({
        isSettlementAccount,
        transferAmount,
        creditsPosted,
        creditsPending,
        debitsPosted,
        debitsPending,
        result
      }): Promise<void> => {
        expect(
          hasEnoughCreditBalance({
            account: isSettlementAccount ? settlementAccount : account,
            balances: {
              creditsPosted,
              creditsPending,
              debitsPosted,
              debitsPending
            },
            transferAmount
          })
        ).toBe(result)
      }
    )
  })

  describe('hasEnoughDebitBalance', (): void => {
    test.each`
      description                                                               | isSettlementAccount | transferAmount | creditsPosted | creditsPending | debitsPosted | debitsPending | result
      ${'passes if non-settlement account'}                                     | ${false}            | ${10n}         | ${0n}         | ${0n}          | ${0n}        | ${0n}         | ${true}
      ${'passes if posted debits surpass transfer amount'}                      | ${true}             | ${10n}         | ${0n}         | ${0n}          | ${11n}       | ${0n}         | ${true}
      ${'passes if posted debits equal transfer amount'}                        | ${true}             | ${10n}         | ${0n}         | ${0n}          | ${10n}       | ${0n}         | ${true}
      ${'passes if posted debits equal transfer amount and all credits'}        | ${true}             | ${6n}          | ${2n}         | ${2n}          | ${10n}       | ${0n}         | ${true}
      ${'fails if posted debits below transfer amount'}                         | ${true}             | ${11n}         | ${0n}         | ${0n}          | ${10n}       | ${0n}         | ${false}
      ${'fails if posted debits below transfer amount, ignores pending debits'} | ${true}             | ${11n}         | ${0n}         | ${0n}          | ${10n}       | ${10n}        | ${false}
      ${'fails if posted debits below transfer amount and posted credits'}      | ${true}             | ${5n}          | ${6n}         | ${0n}          | ${10n}       | ${0n}         | ${false}
      ${'fails if posted debits below transfer amount and pending credits'}     | ${true}             | ${5n}          | ${0n}         | ${6n}          | ${10n}       | ${0n}         | ${false}
      ${'fails if posted debits below transfer amount and all credits'}         | ${true}             | ${5n}          | ${3n}         | ${3n}          | ${10n}       | ${0n}         | ${false}
    `(
      '$description',
      async ({
        isSettlementAccount,
        transferAmount,
        creditsPosted,
        creditsPending,
        debitsPosted,
        debitsPending,
        result
      }): Promise<void> => {
        expect(
          hasEnoughDebitBalance({
            account: isSettlementAccount ? settlementAccount : account,
            balances: {
              creditsPosted,
              creditsPending,
              debitsPosted,
              debitsPending
            },
            transferAmount
          })
        ).toBe(result)
      }
    )
  })

  describe('getAccountTransfers', (): void => {
    let creditAccount: LedgerAccount
    let debitAccount: LedgerAccount

    beforeEach(async (): Promise<void> => {
      creditAccount = account.$clone()
      debitAccount = peerAccount.$clone()
    })

    test.each`
      accountType
      ${'credit'}
      ${'debit'}
    `(
      `gets POSTED transfer for $accountType account `,
      async ({ accountType }): Promise<void> => {
        const transfer = await createLedgerTransfer(
          {
            ledger: account.ledger,
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
            ledger: account.ledger,
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
            ledger: account.ledger,
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
            ledger: account.ledger,
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

  describe('voidTransfer', (): void => {
    let transfer: LedgerTransfer

    beforeEach(async (): Promise<void> => {
      transfer = await createLedgerTransfer(
        {
          creditAccountId: account.id,
          debitAccountId: settlementAccount.id,
          amount: 10n,
          ledger: account.ledger,
          state: LedgerTransferState.PENDING
        },
        knex
      )
    })

    test('voids transfer', async (): Promise<void> => {
      await expect(
        voidTransfer(serviceDeps, transfer.transferRef)
      ).resolves.toBeUndefined()

      expect(
        (
          await LedgerTransfer.query(knex).findOne({
            transferRef: transfer.transferRef
          })
        )?.state
      ).toEqual(LedgerTransferState.VOIDED)
    })

    test('returns error if transfer expired', async (): Promise<void> => {
      await LedgerTransfer.query(knex)
        .findOne({
          transferRef: transfer.transferRef
        })
        .patch({ expiresAt: new Date(Date.now() - 1) })

      await expect(
        voidTransfer(serviceDeps, transfer.transferRef)
      ).resolves.toEqual(TransferError.TransferExpired)
    })

    test('returns error if no transfer found', async (): Promise<void> => {
      await expect(voidTransfer(serviceDeps, uuid())).resolves.toEqual(
        TransferError.UnknownTransfer
      )
    })

    test('returns error if transfer already posted', async (): Promise<void> => {
      await LedgerTransfer.query(knex)
        .findOne({
          transferRef: transfer.transferRef
        })
        .patch({ state: LedgerTransferState.POSTED })

      await expect(
        voidTransfer(serviceDeps, transfer.transferRef)
      ).resolves.toEqual(TransferError.AlreadyPosted)
    })

    test('returns error if transfer already voided', async (): Promise<void> => {
      await expect(
        voidTransfer(serviceDeps, transfer.transferRef)
      ).resolves.toBeUndefined()

      await expect(
        voidTransfer(serviceDeps, transfer.transferRef)
      ).resolves.toEqual(TransferError.AlreadyVoided)
    })
  })

  describe('postTransfer', (): void => {
    let transfer: LedgerTransfer

    beforeEach(async (): Promise<void> => {
      transfer = await createLedgerTransfer(
        {
          creditAccountId: account.id,
          debitAccountId: settlementAccount.id,
          amount: 10n,
          ledger: account.ledger,
          state: LedgerTransferState.PENDING
        },
        knex
      )
    })

    test('posts transfer', async (): Promise<void> => {
      await expect(
        postTransfer(serviceDeps, transfer.transferRef)
      ).resolves.toBeUndefined()

      expect(
        (
          await LedgerTransfer.query(knex).findOne({
            transferRef: transfer.transferRef
          })
        )?.state
      ).toEqual(LedgerTransferState.POSTED)
    })

    test('returns error if transfer expired', async (): Promise<void> => {
      await LedgerTransfer.query(knex)
        .findOne({
          transferRef: transfer.transferRef
        })
        .patch({ expiresAt: new Date(Date.now() - 1) })

      await expect(
        postTransfer(serviceDeps, transfer.transferRef)
      ).resolves.toEqual(TransferError.TransferExpired)
    })

    test('returns error if no transfer found', async (): Promise<void> => {
      await expect(postTransfer(serviceDeps, uuid())).resolves.toEqual(
        TransferError.UnknownTransfer
      )
    })

    test('returns error if transfer already posted', async (): Promise<void> => {
      await LedgerTransfer.query(knex)
        .findOne({
          transferRef: transfer.transferRef
        })
        .patch({ state: LedgerTransferState.POSTED })

      await expect(
        postTransfer(serviceDeps, transfer.transferRef)
      ).resolves.toEqual(TransferError.AlreadyPosted)
    })

    test('returns error if transfer already voided', async (): Promise<void> => {
      await expect(
        voidTransfer(serviceDeps, transfer.transferRef)
      ).resolves.toBeUndefined()

      await expect(
        postTransfer(serviceDeps, transfer.transferRef)
      ).resolves.toEqual(TransferError.AlreadyVoided)
    })
  })
})
