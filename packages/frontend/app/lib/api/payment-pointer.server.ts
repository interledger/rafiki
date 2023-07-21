import { gql } from '@apollo/client'
import { apolloClient } from '../apollo.server'
import type {
  ListPaymentPointersQuery,
  ListPaymentPointersQueryVariables,
  QueryPaymentPointersArgs
} from '~/generated/graphql'

export const listPaymentPointers = async (args: QueryPaymentPointersArgs) => {
  const response = await apolloClient.query<
    ListPaymentPointersQuery,
    ListPaymentPointersQueryVariables
  >({
    query: gql`
      query ListPaymentPointersQuery(
        $after: String
        $before: String
        $first: Int
        $last: Int
      ) {
        paymentPointers(
          after: $after
          before: $before
          first: $first
          last: $last
        ) {
          edges {
            cursor
            node {
              id
              publicName
              status
              url
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

  return response.data.paymentPointers
}
