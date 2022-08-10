import Knex from 'knex'
import { v4 as uuid } from 'uuid'

import { getPageTests } from './page.test'
import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { WebMonetizationEventType } from '../../open_payments/account/model'
import { AccountService } from '../../open_payments/account/service'
import { IncomingPaymentEventType } from '../../open_payments/payment/incoming/model'
import { OutgoingPaymentEventType } from '../../open_payments/payment/outgoing/model'
import { randomAsset } from '../../tests/asset'
import { createIncomingPayment } from '../../tests/incomingPayment'
import { createOutgoingPayment } from '../../tests/outgoingPayment'
import { truncateTables } from '../../tests/tableManager'
import { WebhookEvent } from '../../webhook/model'
import { EventOptions, WebhookService } from '../../webhook/service'

describe('Event Resolver', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let accountService: AccountService
  let webhookService: WebhookService
  let knex: Knex
  let accountId: string

  const asset = randomAsset()
  let i = 0

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    accountService = await deps.use('accountService')
    webhookService = await deps.use('webhookService')
  }, 10_000)

  afterAll(
    async (): Promise<void> => {
      await truncateTables(knex)
      await appContainer.apolloClient.stop()
      await appContainer.shutdown()
    }
  )

  describe('Events query resolver', (): void => {
    beforeEach(
      async (): Promise<void> => {
        accountId = (await accountService.create({ asset })).id
      }
    )

    afterEach(
      async (): Promise<void> => {
        await truncateTables(knex)
      }
    )

    getPageTests({
      getClient: () => appContainer.apolloClient,
      createModel: async () => {
        let options: EventOptions

        const offset = i++ % 3
        switch (offset) {
          case 0:
            options = {
              type: IncomingPaymentEventType.IncomingPaymentCompleted,
              data: (
                await createIncomingPayment(deps, {
                  accountId,
                  incomingAmount: {
                    value: BigInt(123),
                    assetCode: asset.code,
                    assetScale: asset.scale
                  },
                  expiresAt: new Date(Date.now() + 30_000),
                  description: `IncomingPayment`,
                  externalRef: '#123'
                })
              ).toData()
            }
            break
          case 1:
            options = {
              type: WebMonetizationEventType.WebMonetizationReceived,
              data: {
                webMonetization: {
                  accountId,
                  amount: {
                    value: BigInt(10),
                    assetCode: asset.code,
                    assetScale: asset.scale
                  }
                }
              }
            }
            break
          default:
            // Event is auto-created on outgoing payment creation
            await createOutgoingPayment(deps, {
              accountId,
              receiver: `${Config.publicHost}/${uuid()}`,
              sendAmount: {
                value: BigInt(56),
                assetCode: asset.code,
                assetScale: asset.scale
              },
              validDestination: false
            })
            return WebhookEvent.query(knex)
              .findOne({
                type: OutgoingPaymentEventType.OutgoingPaymentCreated
              })
              .orderBy('createdAt', 'desc')
        }
        return webhookService.createEvent(options) as Promise<WebhookEvent>
      },
      pagedQuery: 'events',
      queryFields: `edges {
    node {
      ... on IncomingPaymentEvent {
        id
      }
      ... on OutgoingPaymentEvent {
        id
      }
      ... on WebMonetizationEvent {
        id
      }
    }
    cursor
  }
  pageInfo {
    endCursor
    hasNextPage
    hasPreviousPage
    startCursor
  }`
    })
  })
})
