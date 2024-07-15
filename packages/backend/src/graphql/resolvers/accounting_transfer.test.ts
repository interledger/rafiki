import { IocContract } from '@adonisjs/fold'
import { gql } from '@apollo/client'
import { AppServices } from '../../app'
import { createTestApp, TestContainer } from '../../tests/app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import { AccountingTransferConnection } from '../generated/graphql'
import { createAsset } from '../../tests/asset'
import { v4 as uuid } from 'uuid'
import {
  AccountingService,
  LedgerTransferState,
  LiquidityAccountType
} from '../../accounting/service'
import {
  LedgerTransfer,
  LedgerTransferType
} from '../../accounting/psql/ledger-transfer/model'
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
    await truncateTables(appContainer.knex)
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
    const queryLimit = 100_000
    const insertedTransfer = await LedgerTransfer.query(
      appContainer.knex
    ).insert({
      amount: BigInt(transferAmount),
      debitAccount: accountDebitLedger[0],
      debitAccountId: accountDebitLedger[0].id,
      creditAccount: accountCreditLedger[0],
      creditAccountId: accountCreditLedger[0].id,
      ledger: ledger,
      state: LedgerTransferState.POSTED,
      transferRef: uuid(),
      type: LedgerTransferType.DEPOSIT
    })
    const accountDebitId = accountDebitLedger[0].id
    let response = await appContainer.apolloClient
      .query({
        query: gql`
          query AccountingTransfers($id: String!, $limit: Int!) {
            accountingTransfers(id: $id, limit: $limit) {
              debits {
                id
                debitAccount
                creditAccount
                amount
                transferType
                ledger
                createdAt
              }
              credits {
                id
                debitAccount
                creditAccount
                amount
                transferType
                ledger
                createdAt
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

    expect(response.debits).toBeDefined()
    expect(response.credits).toBeDefined()
    expect(response.debits).toHaveLength(1)
    expect(response.credits).toHaveLength(0)

    expect(response.debits[0]).toMatchObject({
      id: insertedTransfer.id,
      debitAccount: accountDebitId,
      amount: `${transferAmount}`,
      transferType: 'DEPOSIT',
      ledger: ledger
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
                      debitAccount
                      creditAccount
                      amount
                      transferType
                      ledger
                      createdAt
                  }
                  credits {
                      id
                      debitAccount
                      creditAccount
                      amount
                      transferType
                      ledger
                      createdAt
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

    expect(response.debits).toBeDefined()
    expect(response.credits).toBeDefined()
    expect(response.debits).toHaveLength(0)
    expect(response.credits).toHaveLength(1)

    expect(response.credits[0]).toMatchObject({
      id: insertedTransfer.id,
      debitAccount: accountDebitId,
      amount: `${transferAmount}`,
      transferType: 'DEPOSIT',
      ledger: ledger
    })
  })
})
