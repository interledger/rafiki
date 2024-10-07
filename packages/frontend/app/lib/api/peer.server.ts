import { gql } from '@apollo/client'
import type {
  DepositPeerLiquidityInput,
  DepositPeerLiquidityMutation,
  DepositPeerLiquidityMutationVariables,
  CreatePeerInput,
  CreatePeerLiquidityWithdrawalInput,
  CreatePeerMutation,
  CreatePeerMutationVariables,
  DeletePeerMutation,
  DeletePeerMutationVariables,
  GetPeerQuery,
  GetPeerQueryVariables,
  ListPeersQuery,
  ListPeersQueryVariables,
  MutationDeletePeerArgs,
  QueryPeerArgs,
  QueryPeersArgs,
  UpdatePeerInput,
  UpdatePeerMutation,
  UpdatePeerMutationVariables,
  WithdrawPeerLiquidity,
  WithdrawPeerLiquidityVariables
} from '~/generated/graphql'
import { apolloClient } from '../apollo.server'

export const getPeer = async (args: QueryPeerArgs) => {
  const response = await apolloClient.query<
    GetPeerQuery,
    GetPeerQueryVariables
  >({
    query: gql`
      query GetPeerQuery($id: String!) {
        peer(id: $id) {
          id
          name
          staticIlpAddress
          maxPacketAmount
          liquidity
          createdAt
          asset {
            id
            code
            scale
            withdrawalThreshold
          }
          http {
            outgoing {
              endpoint
              authToken
            }
          }
          incomingTokens
        }
      }
    `,
    variables: args
  })

  return response.data.peer
}

export const listPeers = async (args: QueryPeersArgs) => {
  const response = await apolloClient.query<
    ListPeersQuery,
    ListPeersQueryVariables
  >({
    query: gql`
      query ListPeersQuery(
        $after: String
        $before: String
        $first: Int
        $last: Int
      ) {
        peers(after: $after, before: $before, first: $first, last: $last) {
          edges {
            node {
              id
              name
              staticIlpAddress
              http {
                outgoing {
                  endpoint
                }
              }
              asset {
                code
                scale
              }
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

  return response.data.peers
}

export const createPeer = async (args: CreatePeerInput) => {
  const response = await apolloClient.mutate<
    CreatePeerMutation,
    CreatePeerMutationVariables
  >({
    mutation: gql`
      mutation CreatePeerMutation($input: CreatePeerInput!) {
        createPeer(input: $input) {
          peer {
            id
          }
        }
      }
    `,
    variables: {
      input: args
    }
  })

  return response.data?.createPeer
}

export const updatePeer = async (args: UpdatePeerInput) => {
  const response = await apolloClient.mutate<
    UpdatePeerMutation,
    UpdatePeerMutationVariables
  >({
    mutation: gql`
      mutation UpdatePeerMutation($input: UpdatePeerInput!) {
        updatePeer(input: $input) {
          peer {
            id
          }
        }
      }
    `,
    variables: {
      input: args
    }
  })

  return response.data?.updatePeer
}

export const deletePeer = async (args: MutationDeletePeerArgs) => {
  const response = await apolloClient.mutate<
    DeletePeerMutation,
    DeletePeerMutationVariables
  >({
    mutation: gql`
      mutation DeletePeerMutation($input: DeletePeerInput!) {
        deletePeer(input: $input) {
          success
        }
      }
    `,
    variables: args
  })

  return response.data?.deletePeer
}

export const depositPeerLiquidity = async (args: DepositPeerLiquidityInput) => {
  const response = await apolloClient.mutate<
    DepositPeerLiquidityMutation,
    DepositPeerLiquidityMutationVariables
  >({
    mutation: gql`
      mutation DepositPeerLiquidityMutation(
        $input: DepositPeerLiquidityInput!
      ) {
        depositPeerLiquidity(input: $input) {
          success
        }
      }
    `,
    variables: {
      input: args
    }
  })

  return response.data?.depositPeerLiquidity
}

export const withdrawPeerLiquidity = async (
  args: CreatePeerLiquidityWithdrawalInput
) => {
  const response = await apolloClient.mutate<
    WithdrawPeerLiquidity,
    WithdrawPeerLiquidityVariables
  >({
    mutation: gql`
      mutation WithdrawPeerLiquidity(
        $input: CreatePeerLiquidityWithdrawalInput!
      ) {
        createPeerLiquidityWithdrawal(input: $input) {
          success
        }
      }
    `,
    variables: {
      input: args
    }
  })

  return response.data?.createPeerLiquidityWithdrawal
}
