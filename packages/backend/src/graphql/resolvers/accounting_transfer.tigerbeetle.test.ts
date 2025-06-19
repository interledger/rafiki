/**
 * @jest-environment ./packages/backend/jest.tigerbeetle-environment.ts
 */

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
import { v4 as uuid } from 'uuid'
import {
  AccountingService,
  LiquidityAccountType
} from '../../accounting/service'

describe('TigerBeetle: Accounting Transfer', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let accountingService: AccountingService

  beforeAll(async (): Promise<void> => {
    const tigerBeetlePort = (global as unknown as { tigerBeetlePort: number })
      .tigerBeetlePort

    deps = initIocContainer({
      ...Config,
      tigerBeetleReplicaAddresses: [tigerBeetlePort.toString()],
      useTigerBeetle: true
    })
    appContainer = await createTestApp(deps)
    accountingService = await deps.use('accountingService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  test('TigerBeetle: Can get ledger transfer', async (): Promise<void> => {
    const ledger = 9
    const creditAccId = uuid()
    const debitAccId = `${ledger}`
    const debitAccIdUUID = `00000000-0000-0000-0000-00000000000${ledger}`
    const creditAssetId = uuid()
    const accountCredit =
      await accountingService.createLiquidityAndLinkedSettlementAccount(
        {
          id: creditAccId,
          asset: {
            id: creditAssetId,
            ledger
          }
        },
        LiquidityAccountType.ASSET
      )
    expect(accountCredit).toMatchObject({
      id: creditAccId,
      asset: {
        id: creditAssetId,
        ledger
      }
    })

    // Top up debit account first:
    const transferAmount = 123
    const queryLimit = 20
    const depositId = uuid()
    const insertedTransfer = await accountingService.createDeposit({
      id: depositId,
      account: accountCredit,
      amount: BigInt(transferAmount)
    })
    expect(insertedTransfer).toBeUndefined() // No errors.

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
          id: debitAccId,
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
      debitAccountId: debitAccIdUUID,
      creditAccountId: creditAccId,
      amount: `${transferAmount}`,
      transferType: TransferType.Deposit,
      ledger,
      state: TransferState.Posted,
      expiresAt: null
    })

    // Credit:
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
          id: creditAccId,
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
      debitAccountId: debitAccIdUUID,
      creditAccountId: creditAccId,
      amount: `${transferAmount}`,
      transferType: TransferType.Deposit,
      ledger,
      state: TransferState.Posted,
      expiresAt: null
    })
  })
})
