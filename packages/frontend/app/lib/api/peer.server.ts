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
import { getApolloClient } from '../apollo.server'
import { maybeThrowUnauthenticatedError } from '../../shared/utils'

export const getPeer = async (args: QueryPeerArgs, apiToken: string) => {
  try {
    const apolloClient = getApolloClient(apiToken)
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
          }
        }
      `,
      variables: args
    })

    return response.data.peer
  } catch (error) {
    maybeThrowUnauthenticatedError(error)
    throw error
  }
}

export const listPeers = async (args: QueryPeersArgs, apiToken: string) => {
  const apolloClient = getApolloClient(apiToken)
  try {
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
      variables: args,
      errorPolicy: 'all'
    })

    return response.data.peers
  } catch (error) {
    maybeThrowUnauthenticatedError(error)
    throw error
  }
}

export const createPeer = async (args: CreatePeerInput, apiToken: string) => {
  try {
    const apolloClient = getApolloClient(apiToken)
    const response = await apolloClient.mutate<
      CreatePeerMutation,
      CreatePeerMutationVariables
    >({
      mutation: gql`
        mutation CreatePeerMutation($input: CreatePeerInput!) {
          createPeer(input: $input) {
            code
            success
            message
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
  } catch (error) {
    maybeThrowUnauthenticatedError(error)
    throw error
  }
}

export const updatePeer = async (args: UpdatePeerInput, apiToken: string) => {
  try {
    const apolloClient = getApolloClient(apiToken)
    const response = await apolloClient.mutate<
      UpdatePeerMutation,
      UpdatePeerMutationVariables
    >({
      mutation: gql`
        mutation UpdatePeerMutation($input: UpdatePeerInput!) {
          updatePeer(input: $input) {
            code
            success
            message
          }
        }
      `,
      variables: {
        input: args
      }
    })

    return response.data?.updatePeer
  } catch (error) {
    maybeThrowUnauthenticatedError(error)
    throw error
  }
}

export const deletePeer = async (
  args: MutationDeletePeerArgs,
  apiToken: string
) => {
  try {
    const apolloClient = getApolloClient(apiToken)
    const response = await apolloClient.mutate<
      DeletePeerMutation,
      DeletePeerMutationVariables
    >({
      mutation: gql`
        mutation DeletePeerMutation($input: DeletePeerInput!) {
          deletePeer(input: $input) {
            code
            success
            message
          }
        }
      `,
      variables: args
    })

    return response.data?.deletePeer
  } catch (error) {
    maybeThrowUnauthenticatedError(error)
    throw error
  }
}

export const depositPeerLiquidity = async (
  args: DepositPeerLiquidityInput,
  apiToken: string
) => {
  try {
    const apolloClient = getApolloClient(apiToken)
    const response = await apolloClient.mutate<
      DepositPeerLiquidityMutation,
      DepositPeerLiquidityMutationVariables
    >({
      mutation: gql`
        mutation DepositPeerLiquidityMutation(
          $input: DepositPeerLiquidityInput!
        ) {
          depositPeerLiquidity(input: $input) {
            code
            success
            message
            error
          }
        }
      `,
      variables: {
        input: args
      }
    })

    return response.data?.depositPeerLiquidity
  } catch (error) {
    maybeThrowUnauthenticatedError(error)
    throw error
  }
}

export const withdrawPeerLiquidity = async (
  args: CreatePeerLiquidityWithdrawalInput,
  apiToken: string
) => {
  try {
    const apolloClient = getApolloClient(apiToken)
    const response = await apolloClient.mutate<
      WithdrawPeerLiquidity,
      WithdrawPeerLiquidityVariables
    >({
      mutation: gql`
        mutation WithdrawPeerLiquidity(
          $input: CreatePeerLiquidityWithdrawalInput!
        ) {
          createPeerLiquidityWithdrawal(input: $input) {
            code
            success
            message
            error
          }
        }
      `,
      variables: {
        input: args
      }
    })

    return response.data?.createPeerLiquidityWithdrawal
  } catch (error) {
    maybeThrowUnauthenticatedError(error)
    throw error
  }
}
