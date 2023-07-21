import { gql } from '@apollo/client'
import { apolloClient } from '../apollo.server'
import type {
  GetPaymentPointerQuery,
  GetPaymentPointerQueryVariables,
  ListPaymentPointersQuery,
  ListPaymentPointersQueryVariables,
  QueryPaymentPointerArgs,
  QueryPaymentPointersArgs,
  UpdatePaymentPointerInput
} from '~/generated/graphql'

export const getPaymentPointer = async (args: QueryPaymentPointerArgs) => {
  const response = await apolloClient.query<
    GetPaymentPointerQuery,
    GetPaymentPointerQueryVariables
  >({
    query: gql`
      query GetPaymentPointerQuery($id: String!) {
        paymentPointer(id: $id) {
          id
          url
          publicName
          status
          createdAt
          asset {
            id
            code
            scale
            withdrawalThreshold
          }
        }
      }
    `,
    variables: args
  })

  return response.data.paymentPointer
}

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

export const updatePaymentPointer = async (args: UpdatePaymentPointerInput) => {
  const response = await apolloClient.mutate({
    mutation: gql`
      mutation UpdatePaymentPointerMutation(
        $input: UpdatePaymentPointerInput!
      ) {
        updatePaymentPointer(input: $input) {
          code
          message
          success
        }
      }
    `,
    variables: {
      input: args
    }
  })

  return response.data.updatePaymentPointer
}
