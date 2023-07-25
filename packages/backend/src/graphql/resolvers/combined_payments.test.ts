import { IocContract } from '@adonisjs/fold'
import { gql } from '@apollo/client'
import { AppServices } from '../../app'
import { createTestApp, TestContainer } from '../../tests/app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import { PaymentConnection } from '../generated/graphql'
import { createPaymentPointer } from '../../tests/paymentPointer'
import { createIncomingPayment } from '../../tests/incomingPayment'
import { createOutgoingPayment } from '../../tests/outgoingPayment'
import { createAsset } from '../../tests/asset'
import { v4 as uuid } from 'uuid'
import { Asset } from '../../asset/model'

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
  test('Can get payments', async (): Promise<void> => {
    const { id: outPaymentPointerId } = await createPaymentPointer(deps, {
      assetId: asset.id
    })

    await createOutgoingPayment(deps, {
      paymentPointerId: outPaymentPointerId,
      receiver: `${Config.publicHost}/${uuid()}`,
      sendAmount: {
        value: BigInt(56),
        assetCode: asset.code,
        assetScale: asset.scale
      },
      validDestination: false
    })

    const { id: inPaymentPointerId } = await createPaymentPointer(deps, {
      assetId: asset.id
    })
    await createIncomingPayment(deps, { paymentPointerId: inPaymentPointerId })

    const query = await appContainer.apolloClient
      .query({
        query: gql`
          query Payments {
            payments {
              edges {
                node {
                  type
                  data {
                    ... on IncomingPayment {
                      id
                      paymentPointerId
                      incomingPaymentState: state
                      metadata
                      createdAt
                    }
                    ... on OutgoingPayment {
                      id
                      paymentPointerId
                      outgoingPaymentState: state
                      metadata
                      createdAt
                    }
                  }
                }
                cursor
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
  })
})
