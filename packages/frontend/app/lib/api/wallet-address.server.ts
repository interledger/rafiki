import { gql } from '@apollo/client'
import { apolloClient } from '../apollo.server'
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

export const getWalletAddress = async (
  args: QueryWalletAddressArgs,
  cookie?: string
) => {
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
    variables: args,
    context: { headers: { cookie } }
  })

  return response.data.walletAddress
}

export const listWalletAddresses = async (
  args: QueryWalletAddressesArgs,
  cookie?: string
) => {
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
    variables: args,
    context: { headers: { cookie } }
  })

  return response.data.walletAddresses
}

export const updateWalletAddress = async (
  args: UpdateWalletAddressInput,
  cookie?: string
) => {
  const response = await apolloClient.mutate({
    mutation: gql`
      mutation UpdateWalletAddressMutation($input: UpdateWalletAddressInput!) {
        updateWalletAddress(input: $input) {
          walletAddress {
            id
          }
        }
      }
    `,
    variables: {
      input: args
    },
    context: { headers: { cookie } }
  })

  return response.data.updateWalletAddress
}

export const createWalletAddress = async (
  args: CreateWalletAddressInput,
  cookie?: string
) => {
  const response = await apolloClient.mutate<
    CreateWalletAddressMutation,
    CreateWalletAddressMutationVariables
  >({
    mutation: gql`
      mutation CreateWalletAddressMutation($input: CreateWalletAddressInput!) {
        createWalletAddress(input: $input) {
          walletAddress {
            id
          }
        }
      }
    `,
    variables: {
      input: args
    },
    context: { headers: { cookie } }
  })

  return response.data?.createWalletAddress
}

export const createWalletAddressWithdrawal = async (
  args: CreateWalletAddressWithdrawalInput,
  cookie?: string
) => {
  const response = await apolloClient.mutate<
    CreateWalletAddressWithdrawal,
    CreateWalletAddressWithdrawalVariables
  >({
    mutation: gql`
      mutation CreateWalletAddressWithdrawal(
        $input: CreateWalletAddressWithdrawalInput!
      ) {
        createWalletAddressWithdrawal(input: $input) {
          withdrawal {
            id
          }
        }
      }
    `,
    variables: {
      input: args
    },
    context: { headers: { cookie } }
  })

  return response.data?.createWalletAddressWithdrawal
}
