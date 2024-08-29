import { gql } from '@apollo/client'
import { apolloClient } from '../apollo.server'
import type {
  QueryWebhookEventsArgs,
  ListWebhookEvents,
  ListWebhookEventsVariables
} from '~/generated/graphql'

export const listWebhooks = async (
  args: QueryWebhookEventsArgs,
  cookie?: string
) => {
  const response = await apolloClient.query<
    ListWebhookEvents,
    ListWebhookEventsVariables
  >({
    query: gql`
      query ListWebhookEvents(
        $after: String
        $before: String
        $first: Int
        $last: Int
        $filter: WebhookEventFilter
      ) {
        webhookEvents(
          after: $after
          before: $before
          first: $first
          last: $last
          filter: $filter
        ) {
          edges {
            cursor
            node {
              id
              data
              type
              createdAt
            }
          }
          pageInfo {
            startCursor
            endCursor
            hasNextPage
            hasPreviousPage
          }
        }
      }
    `,
    variables: args,
    context: { headers: { cookie } }
  })

  return response.data.webhookEvents
}
