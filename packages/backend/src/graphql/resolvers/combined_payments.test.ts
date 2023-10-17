import { IocContract } from '@adonisjs/fold'
import { gql } from '@apollo/client'
import { AppServices } from '../../app'
import { createTestApp, TestContainer } from '../../tests/app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import { PaymentConnection } from '../generated/graphql'
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

describe('Payment', (): void => {
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

    const outgoingPayment = await createOutgoingPayment(deps, {
      walletAddressId: outWalletAddressId,
      receiver: `${Config.publicHost}/${uuid()}`,
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
      walletAddressId: inWalletAddressId
    })

    const query = await appContainer.apolloClient
      .query({
        query: gql`
          query Payments {
            payments {
              edges {
                node {
                  id
                  type
                  walletAddressId
                  state
                  metadata
                  createdAt
                }
                cursor
              }
              pageInfo {
                endCursor
                hasNextPage
                hasPreviousPage
                startCursor
              }
            }
          }
        `
      })
      .then((query): PaymentConnection => {
        if (query.data) {
          return query.data.payments
        } else {
          throw new Error('Data was empty')
        }
      })

    expect(query.edges).toHaveLength(2)

    const combinedOutgoingPayment = toCombinedPayment(
      PaymentType.Outgoing,
      outgoingPayment
    )
    expect(query.edges[0].node).toMatchObject({
      id: combinedOutgoingPayment.id,
      type: combinedOutgoingPayment.type,
      metadata: combinedOutgoingPayment.metadata,
      walletAddressId: combinedOutgoingPayment.walletAddressId,
      state: combinedOutgoingPayment.state,
      createdAt: combinedOutgoingPayment.createdAt.toISOString()
    })

    const combinedIncomingPayment = toCombinedPayment(
      PaymentType.Incoming,
      incomingPayment
    )
    expect(query.edges[1].node).toMatchObject({
      id: combinedIncomingPayment.id,
      type: combinedIncomingPayment.type,
      metadata: combinedIncomingPayment.metadata,
      walletAddressId: combinedIncomingPayment.walletAddressId,
      state: combinedIncomingPayment.state,
      createdAt: combinedIncomingPayment.createdAt.toISOString()
    })
  })

  test('Can filter payments by type and wallet address', async (): Promise<void> => {
    const { id: outWalletAddressId } = await createWalletAddress(deps, {
      assetId: asset.id
    })

    const baseOutgoingPayment = {
      receiver: `${Config.publicHost}/${uuid()}`,
      debitAmount: {
        value: BigInt(56),
        assetCode: asset.code,
        assetScale: asset.scale
      },
      validDestination: false
    }

    const outgoingPayment = await createOutgoingPayment(deps, {
      walletAddressId: outWalletAddressId,
      ...baseOutgoingPayment
    })

    const { id: outWalletAddressId2 } = await createWalletAddress(deps, {
      assetId: asset.id
    })
    await createOutgoingPayment(deps, {
      walletAddressId: outWalletAddressId2,
      ...baseOutgoingPayment
    })

    const query = await appContainer.apolloClient
      .query({
        query: gql`
          query Payments($filter: PaymentFilter) {
            payments(filter: $filter) {
              edges {
                node {
                  id
                  type
                  walletAddressId
                  state
                  metadata
                  createdAt
                }
                cursor
              }
            }
          }
        `,
        variables: {
          filter: {
            type: {
              in: ['OUTGOING']
            },
            walletAddressId: {
              in: [outWalletAddressId]
            }
          }
        }
      })
      .then((query): PaymentConnection => {
        if (query.data) {
          return query.data.payments
        } else {
          throw new Error('Data was empty')
        }
      })

    expect(query.edges).toHaveLength(1)

    const combinedOutgoingPayment = toCombinedPayment(
      PaymentType.Outgoing,
      outgoingPayment
    )
    expect(query.edges[0].node).toMatchObject({
      id: combinedOutgoingPayment.id,
      type: combinedOutgoingPayment.type,
      metadata: combinedOutgoingPayment.metadata,
      walletAddressId: combinedOutgoingPayment.walletAddressId,
      state: combinedOutgoingPayment.state,
      createdAt: combinedOutgoingPayment.createdAt.toISOString()
    })
  })
})
