import { gql } from '@apollo/client'
import type {
  CreatePeerInput,
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
  UpdatePeerMutationVariables
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
}

export const updatePeer = async (args: UpdatePeerInput) => {
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
}

export const deletePeer = async (args: MutationDeletePeerArgs) => {
  const response = await apolloClient.mutate<
    DeletePeerMutation,
    DeletePeerMutationVariables
  >({
    mutation: gql`
      mutation DeletePeerMutation($id: String!) {
        deletePeer(id: $id) {
          code
          success
          message
        }
      }
    `,
    variables: args
  })

  return response.data?.deletePeer
}
