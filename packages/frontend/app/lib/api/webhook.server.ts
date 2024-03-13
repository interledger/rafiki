import { gql } from '@apollo/client'
import { getApolloClient } from '../apollo.server'
import type {
  QueryWebhookEventsArgs,
  ListWebhookEvents,
  ListWebhookEventsVariables
} from '~/generated/graphql'
import { throwUnauthenticatedErrorOrError } from '~/shared/utils'

export const listWebhooks = async (
  args: QueryWebhookEventsArgs,
  apiToken: string
) => {
  try {
    const apolloClient = getApolloClient(apiToken)
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
      variables: args
    })

    return response.data.webhookEvents
  } catch (error) {
    throwUnauthenticatedErrorOrError(error)
  }
}
