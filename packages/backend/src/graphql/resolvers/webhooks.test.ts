import { ApolloClient, gql, NormalizedCacheObject } from '@apollo/client'
import { getPageTests } from './page.test'
import {
  createApolloClient,
  createTestApp,
  TestContainer
} from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import { WebhookEventsConnection } from '../generated/graphql'
import { createWebhookEvent, webhookEventTypes } from '../../tests/webhook'
import { WebhookEvent } from '../../webhook/event/model'
import { createTenant } from '../../tests/tenant'

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
                  tenant {
                    id
                  }
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
        data: webhookEvent.data,
        tenant: {
          __typename: 'Tenant',
          id: webhookEvent.tenantId
        }
      })
    })
  })

  test('Default excludes funded/cancelled outgoing payment events', async (): Promise<void> => {
    await createWebhookEvent(deps, {
      type: 'outgoing_payment.funded'
    })
    await createWebhookEvent(deps, {
      type: 'outgoing_payment.cancelled'
    })

    // Default query without filter should exclude both funded and cancelled events
    const withoutFilter = await appContainer.apolloClient
      .query({
        query: gql`
          query WebhookEvents {
            webhookEvents {
              edges {
                node {
                  id
                  type
                }
              }
            }
          }
        `
      })
      .then((q): WebhookEventsConnection => q.data!.webhookEvents)

    const typesWithout = withoutFilter.edges.map((e) => e.node.type)
    expect(typesWithout).not.toContain('outgoing_payment.funded')
    expect(typesWithout).not.toContain('outgoing_payment.cancelled')

    // Explicit empty array filter should behave like no filter and still exclude them
    const withEmptyIn = await appContainer.apolloClient
      .query({
        query: gql`
          query WebhookEvents($filter: WebhookEventFilter) {
            webhookEvents(filter: $filter) {
              edges {
                node {
                  id
                  type
                }
              }
            }
          }
        `,
        variables: { filter: { type: { in: [] } } }
      })
      .then((q): WebhookEventsConnection => q.data!.webhookEvents)

    const typesEmpty = withEmptyIn.edges.map((e) => e.node.type)
    expect(typesEmpty).not.toContain('outgoing_payment.funded')
    expect(typesEmpty).not.toContain('outgoing_payment.cancelled')

    // When explicitly requested via filter, they still should not appear
    const withFilter = await appContainer.apolloClient
      .query({
        query: gql`
          query WebhookEvents($filter: WebhookEventFilter) {
            webhookEvents(filter: $filter) {
              edges {
                node {
                  id
                  type
                }
              }
            }
          }
        `,
        variables: {
          filter: {
            type: {
              in: ['outgoing_payment.funded', 'outgoing_payment.cancelled'],
              notIn: []
            }
          }
        }
      })
      .then((q): WebhookEventsConnection => q.data!.webhookEvents)

    const typesWith = withFilter.edges.map((e) => e.node.type)
    expect(typesWith).toStrictEqual([])
  })

  describe('tenant boundaries', (): void => {
    let operatorWebhookEvent: WebhookEvent
    let tenantWebhookEvent: WebhookEvent
    let secondTenantWebhookEvent: WebhookEvent
    let tenantedApolloClient: ApolloClient<NormalizedCacheObject>

    const pageQuery = gql`
      query WebhookEvents($tenantId: String) {
        webhookEvents(tenantId: $tenantId) {
          edges {
            node {
              id
              type
              data
              tenant {
                id
              }
            }
            cursor
          }
        }
      }
    `

    beforeEach(async (): Promise<void> => {
      operatorWebhookEvent = await createWebhookEvent(deps)
      const tenant = await createTenant(deps)
      tenantedApolloClient = await createApolloClient(
        appContainer.container,
        appContainer.app,
        tenant.id
      )
      tenantWebhookEvent = await createWebhookEvent(deps, {
        tenantId: tenant.id
      })
      secondTenantWebhookEvent = await createWebhookEvent(deps, {
        tenantId: tenant.id
      })
    })

    test('Can get webhooks across tenants as operator', async (): Promise<void> => {
      const query = await appContainer.apolloClient
        .query({
          query: pageQuery
        })
        .then((query): WebhookEventsConnection => {
          if (query.data) {
            return query.data.webhookEvents
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(query.edges).toHaveLength(3)
      const ids = query.edges.map((e) => e.node.id)
      expect(ids).toContain(operatorWebhookEvent.id)
      expect(ids).toContain(tenantWebhookEvent.id)
      expect(ids).toContain(secondTenantWebhookEvent.id)
    })

    test('Cannot get webhooks across tenants as tenant', async (): Promise<void> => {
      const query = await tenantedApolloClient
        .query({
          query: pageQuery
        })
        .then((query): WebhookEventsConnection => {
          if (query.data) {
            return query.data.webhookEvents
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(query.edges).toHaveLength(2)
      const ids = query.edges.map((e) => e.node.id)
      expect(ids).toContain(tenantWebhookEvent.id)
      expect(ids).toContain(secondTenantWebhookEvent.id)
    })

    test('can filter webhooks by tenant as operator', async (): Promise<void> => {
      const query = await appContainer.apolloClient
        .query({
          query: pageQuery,
          variables: { tenantId: tenantWebhookEvent.tenantId }
        })
        .then((query): WebhookEventsConnection => {
          if (query.data) {
            return query.data.webhookEvents
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(query.edges).toHaveLength(2)
      const ids = query.edges.map((e) => e.node.id)
      expect(ids).toContain(tenantWebhookEvent.id)
      expect(ids).toContain(secondTenantWebhookEvent.id)
    })

    test('cannot filter webhooks by tenant as tenant', async (): Promise<void> => {
      const query = await tenantedApolloClient
        .query({
          query: pageQuery,
          variables: { tenantId: operatorWebhookEvent.tenantId }
        })
        .then((query): WebhookEventsConnection => {
          if (query.data) {
            return query.data.webhookEvents
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(query.edges).toHaveLength(2)
      const ids = query.edges.map((e) => e.node.id)
      expect(ids).toContain(tenantWebhookEvent.id)
      expect(ids).toContain(secondTenantWebhookEvent.id)
    })
  })
})
