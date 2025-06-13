import { IocContract } from '@adonisjs/fold'
import { gql } from '@apollo/client'
import { AppServices } from '../../app'
import { createTestApp, TestContainer } from '../../tests/app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import {
  AccountingTransferConnection,
  TransferState,
  TransferType
} from '../generated/graphql'
import { createAsset } from '../../tests/asset'
import { createLedgerTransfer } from '../../tests/ledgerTransfer'
import { v4 as uuid } from 'uuid'
import {
  AccountingService,
  LedgerTransferState,
  LiquidityAccountType
} from '../../accounting/service'
import { LedgerTransferType } from '../../accounting/psql/ledger-transfer/model'
import { LedgerAccount } from '../../accounting/psql/ledger-account/model'

describe('Accounting Transfer', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let accountingService: AccountingService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    accountingService = await deps.use('accountingService')
  })

  beforeEach(async (): Promise<void> => {
    await createAsset(deps)
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  test('Can get ledger transfer', async (): Promise<void> => {
    const accountDebit = await accountingService.createLiquidityAccount(
      {
        id: uuid(),
        asset: {
          id: uuid(),
          ledger: 1
        }
      },
      LiquidityAccountType.WEB_MONETIZATION
    )
    await accountingService.createLiquidityAccount(
      {
        id: accountDebit.asset.id,
        asset: {
          id: uuid(),
          ledger: 1
        }
      },
      LiquidityAccountType.WEB_MONETIZATION
    )
    const accountCredit = await accountingService.createLiquidityAccount(
      {
        id: uuid(),
        asset: {
          id: uuid(),
          ledger: 1
        }
      },
      LiquidityAccountType.WEB_MONETIZATION
    )
    await accountingService.createLiquidityAccount(
      {
        id: accountCredit.asset.id,
        asset: {
          id: uuid(),
          ledger: 1
        }
      },
      LiquidityAccountType.WEB_MONETIZATION
    )

    const accountDebitLedger = await LedgerAccount.query(
      appContainer.knex
    ).where({
      accountRef: accountDebit.id
    })
    const accountCreditLedger = await LedgerAccount.query(
      appContainer.knex
    ).where({
      accountRef: accountCredit.id
    })
    // Top up debit account first:
    const transferAmount = 123
    const ledger = 1
    const tomorrow = new Date(new Date().getDate() + 1)
    const queryLimit = 20

    const insertedTransfer = await createLedgerTransfer(
      {
        amount: BigInt(transferAmount),
        debitAccountId: accountDebitLedger[0].id,
        creditAccountId: accountCreditLedger[0].id,
        ledger: ledger,
        state: LedgerTransferState.POSTED,
        transferRef: uuid(),
        type: LedgerTransferType.DEPOSIT,
        expiresAt: tomorrow
      },
      appContainer.knex
    )
    const accountDebitId = accountDebitLedger[0].id
    let response = await appContainer.apolloClient
      .query({
        query: gql`
          query AccountingTransfers($id: String!, $limit: Int!) {
            accountingTransfers(id: $id, limit: $limit) {
              debits {
                id
                debitAccountId
                creditAccountId
                amount
                transferType
                ledger
                createdAt
                state
                expiresAt
              }
              credits {
                id
                debitAccountId
                creditAccountId
                amount
                transferType
                ledger
                createdAt
                state
                expiresAt
              }
            }
          }
        `,
        variables: {
          id: accountDebitId,
          limit: queryLimit
        }
      })
      .then((query): AccountingTransferConnection => {
        if (query.data) {
          return query.data.accountingTransfers
        } else {
          throw new Error('Data was empty')
        }
      })

    expect(response.debits).toHaveLength(1)
    expect(response.credits).toHaveLength(0)

    expect(response.debits[0]).toMatchObject({
      id: insertedTransfer.id,
      debitAccountId: accountDebitId,
      amount: `${transferAmount}`,
      transferType: TransferType.Deposit,
      ledger,
      state: TransferState.Posted,
      expiresAt: tomorrow.toISOString()
    })

    // Credit:
    const accountCreditId = accountCreditLedger[0].id
    response = await appContainer.apolloClient
      .query({
        query: gql`
          query AccountingTransfers($id: String!, $limit: Int!) {
            accountingTransfers(id: $id, limit: $limit) {
              debits {
                id
                debitAccountId
                creditAccountId
                amount
                transferType
                ledger
                createdAt
                state
                expiresAt
              }
              credits {
                id
                debitAccountId
                creditAccountId
                amount
                transferType
                ledger
                createdAt
                state
                expiresAt
              }
            }
          }
        `,
        variables: {
          id: accountCreditId,
          limit: queryLimit
        }
      })
      .then((query): AccountingTransferConnection => {
        if (query.data) {
          return query.data.accountingTransfers
        } else {
          throw new Error('Data was empty')
        }
      })

    expect(response.debits).toHaveLength(0)
    expect(response.credits).toHaveLength(1)

    expect(response.credits[0]).toMatchObject({
      id: insertedTransfer.id,
      debitAccountId: accountDebitId,
      creditAccountId: accountCreditId,
      amount: `${transferAmount}`,
      transferType: TransferType.Deposit,
      ledger,
      state: TransferState.Posted,
      expiresAt: tomorrow.toISOString()
    })
  })
})
