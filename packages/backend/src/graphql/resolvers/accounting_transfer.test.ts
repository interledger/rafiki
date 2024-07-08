import { IocContract } from '@adonisjs/fold'
import { gql } from '@apollo/client'
import { AppServices } from '../../app'
import { createTestApp, TestContainer } from '../../tests/app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import { AccountingTransferConnection } from '../generated/graphql'
import { createWalletAddress } from '../../tests/walletAddress'
import { createIncomingPayment } from '../../tests/incomingPayment'
import { createOutgoingPayment } from '../../tests/outgoingPayment'
import { createAsset } from '../../tests/asset'
import { v4 as uuid } from 'uuid'
import { Asset } from '../../asset/model'
import {
  createCombinedPayment,
  toCombinedPayment
} from '../../tests/combinedPayment'
import { PaymentType } from '../../open_payments/payment/combined/model'
import { getPageTests } from './page.test'

describe('Accounting Transfer', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let asset: Asset

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
  })

  beforeEach(async (): Promise<void> => {
    asset = await createAsset(deps)
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  getPageTests({
    getClient: () => appContainer.apolloClient,
    createModel: () => createCombinedPayment(deps),
    pagedQuery: 'payments'
  })

  test('Can get payments', async (): Promise<void> => {
    const { id: outWalletAddressId } = await createWalletAddress(deps, {
      assetId: asset.id
    })

    const client = 'client-test'
    const outgoingPayment = await createOutgoingPayment(deps, {
      walletAddressId: outWalletAddressId,
      client: client,
      method: 'ilp',
      receiver: `${Config.openPaymentsUrl}/${uuid()}`,
      debitAmount: {
        value: BigInt(56),
        assetCode: asset.code,
        assetScale: asset.scale
      },
      validDestination: false
    })

    const { id: inWalletAddressId } = await createWalletAddress(deps, {
      assetId: asset.id
    })
    const incomingPayment = await createIncomingPayment(deps, {
      walletAddressId: inWalletAddressId,
      client: client
    })

    const input = {
      inWalletAddressId,
      limit: 100_000
    }

    const query = await appContainer.apolloClient
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
          id: input.inWalletAddressId,
          limit: input.limit
        }
      })
      .then((query): AccountingTransferConnection => {
        if (query.data) {
          return query.data
        } else {
          throw new Error('Data was empty')
        }
      })

    expect(query.debits).toHaveLength(1)
    expect(query.credits).toHaveLength(1)

    const combinedOutgoingPayment = toCombinedPayment(
      PaymentType.Outgoing,
      outgoingPayment
    )
    expect(query.debits[0]).toMatchObject({
      id: combinedOutgoingPayment.id,
      type: combinedOutgoingPayment.type,
      metadata: combinedOutgoingPayment.metadata,
      walletAddressId: combinedOutgoingPayment.walletAddressId,
      client: combinedOutgoingPayment.client,
      state: combinedOutgoingPayment.state,
      createdAt: combinedOutgoingPayment.createdAt.toISOString(),
      liquidity: '0'
    })
    expect(query.credits[0]).toMatchObject({
      id: combinedOutgoingPayment.id,
      type: combinedOutgoingPayment.type,
      metadata: combinedOutgoingPayment.metadata,
      walletAddressId: combinedOutgoingPayment.walletAddressId,
      client: combinedOutgoingPayment.client,
      state: combinedOutgoingPayment.state,
      createdAt: combinedOutgoingPayment.createdAt.toISOString(),
      liquidity: '0'
    })
  })
})
