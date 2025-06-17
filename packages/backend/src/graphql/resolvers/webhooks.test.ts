import { gql } from '@apollo/client'
import { getPageTests } from './page.test'
import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import { WebhookEventsConnection } from '../generated/graphql'
import { createWebhookEvent, webhookEventTypes } from '../../tests/webhook'
import { WebhookEvent } from '../../webhook/event/model'

describe('Webhook Events Query', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  getPageTests({
    getClient: () => appContainer.apolloClient,
    createModel: () => createWebhookEvent(deps),
    pagedQuery: 'webhookEvents'
  })

  test('Can get webhookEvents', async (): Promise<void> => {
    const webhookEvents: WebhookEvent[] = []
    const numOfEachEventType = 3

    for (let i = 0; i < webhookEventTypes.length; i++) {
      for (let j = 0; j < numOfEachEventType; j++) {
        webhookEvents.push(
          await createWebhookEvent(deps, { type: webhookEventTypes[i] })
        )
      }
    }
    webhookEvents.reverse() // Calling the default getPage will result in descending order

    const filter = {
      type: {
        in: [webhookEventTypes[1], webhookEventTypes[2]]
      }
    }

    const query = await appContainer.apolloClient
      .query({
        query: gql`
          query WebhookEvents($filter: WebhookEventFilter) {
            webhookEvents(filter: $filter) {
              edges {
                node {
                  id
                  type
                  data
                }
                cursor
              }
            }
          }
        `,
        variables: { filter }
      })
      .then((query): WebhookEventsConnection => {
        if (query.data) {
          return query.data.webhookEvents
        } else {
          throw new Error('Data was empty')
        }
      })

    expect(query.edges).toHaveLength(numOfEachEventType * filter.type.in.length)
    query.edges.forEach((edge, idx) => {
      const webhookEvent = webhookEvents[idx]
      expect(edge.cursor).toEqual(webhookEvent.id)
      expect(edge.node).toEqual({
        __typename: 'WebhookEvent',
        id: webhookEvent.id,
        type: webhookEvent.type,
        data: webhookEvent.data
      })
    })
  })
})
