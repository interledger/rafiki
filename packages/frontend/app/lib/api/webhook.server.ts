import { gql } from '@apollo/client'
import { getApolloClient } from '../apollo.server'
import type {
  QueryWebhookEventsArgs,
  ListWebhookEvents,
  ListWebhookEventsVariables
} from '~/generated/graphql'

export const listWebhooks = async (
  request: Request,
  args: QueryWebhookEventsArgs
) => {
  const apolloClient = await getApolloClient(request)
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
              tenantId
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
    variables: args
  })

  return response.data.webhookEvents
}
