import { gql } from '@apollo/client'
import { getApolloClient } from '../apollo.server'
import type {
  CreateWalletAddressMutation,
  CreateWalletAddressInput,
  GetWalletAddressQuery,
  GetWalletAddressQueryVariables,
  ListWalletAddresssQuery,
  ListWalletAddresssQueryVariables,
  QueryWalletAddressArgs,
  QueryWalletAddressesArgs,
  UpdateWalletAddressInput,
  CreateWalletAddressMutationVariables,
  CreateWalletAddressWithdrawalVariables,
  CreateWalletAddressWithdrawal,
  CreateWalletAddressWithdrawalInput
} from '~/generated/graphql'
import { maybeThrowUnauthenticatedError } from '~/shared/utils'

export const getWalletAddress = async (
  args: QueryWalletAddressArgs,
  apiToken: string
) => {
  try {
    const apolloClient = getApolloClient(apiToken)
    const response = await apolloClient.query<
      GetWalletAddressQuery,
      GetWalletAddressQueryVariables
    >({
      query: gql`
        query GetWalletAddressQuery($id: String!) {
          walletAddress(id: $id) {
            id
            url
            publicName
            status
            createdAt
            liquidity
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

    return response.data.walletAddress
  } catch (error) {
    maybeThrowUnauthenticatedError(error)
    throw error
  }
}

export const listWalletAddresses = async (
  args: QueryWalletAddressesArgs,
  apiToken: string
) => {
  try {
    const apolloClient = getApolloClient(apiToken)
    const response = await apolloClient.query<
      ListWalletAddresssQuery,
      ListWalletAddresssQueryVariables
    >({
      query: gql`
        query ListWalletAddresssQuery(
          $after: String
          $before: String
          $first: Int
          $last: Int
        ) {
          walletAddresses(
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

    return response.data.walletAddresses
  } catch (error) {
    maybeThrowUnauthenticatedError(error)
    throw error
  }
}

export const updateWalletAddress = async (
  args: UpdateWalletAddressInput,
  apiToken: string
) => {
  try {
    const apolloClient = getApolloClient(apiToken)
    const response = await apolloClient.mutate({
      mutation: gql`
        mutation UpdateWalletAddressMutation(
          $input: UpdateWalletAddressInput!
        ) {
          updateWalletAddress(input: $input) {
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

    return response.data.updateWalletAddress
  } catch (error) {
    maybeThrowUnauthenticatedError(error)
    throw error
  }
}

export const createWalletAddress = async (
  args: CreateWalletAddressInput,
  apiToken: string
) => {
  try {
    const apolloClient = getApolloClient(apiToken)
    const response = await apolloClient.mutate<
      CreateWalletAddressMutation,
      CreateWalletAddressMutationVariables
    >({
      mutation: gql`
        mutation CreateWalletAddressMutation(
          $input: CreateWalletAddressInput!
        ) {
          createWalletAddress(input: $input) {
            code
            success
            message
            walletAddress {
              id
            }
          }
        }
      `,
      variables: {
        input: args
      }
    })

    return response.data?.createWalletAddress
  } catch (error) {
    maybeThrowUnauthenticatedError(error)
    throw error
  }
}

export const createWalletAddressWithdrawal = async (
  args: CreateWalletAddressWithdrawalInput,
  apiToken: string
) => {
  try {
    const apolloClient = getApolloClient(apiToken)
    const response = await apolloClient.mutate<
      CreateWalletAddressWithdrawal,
      CreateWalletAddressWithdrawalVariables
    >({
      mutation: gql`
        mutation CreateWalletAddressWithdrawal(
          $input: CreateWalletAddressWithdrawalInput!
        ) {
          createWalletAddressWithdrawal(input: $input) {
            success
            message
          }
        }
      `,
      variables: {
        input: args
      }
    })

    return response.data?.createWalletAddressWithdrawal
  } catch (error) {
    maybeThrowUnauthenticatedError(error)
    throw error
  }
}
