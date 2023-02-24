import {
  gql,
  type ApolloClient,
  type NormalizedCacheObject
} from '@apollo/client'
import type {
  CreatePeerInput,
  MutationDeletePeerArgs,
  QueryPeerArgs,
  QueryPeersArgs,
  UpdatePeerInput
} from '~/generated/graphql'
import type {
  CreatePeerMutation,
  CreatePeerMutationVariables,
  DeletePeerMutation,
  DeletePeerMutationVariables,
  GetPeerQuery,
  GetPeerQueryVariables,
  ListPeersQuery,
  ListPeersQueryVariables,
  UpdatePeerMutation,
  UpdatePeerMutationVariables
} from './generated/peer.server'

export class PeerService {
  private apollo: ApolloClient<NormalizedCacheObject>

  constructor(apollo: ApolloClient<NormalizedCacheObject>) {
    this.apollo = apollo
  }

  public async get(args: QueryPeerArgs) {
    const response = await this.apollo.query<
      GetPeerQuery,
      GetPeerQueryVariables
    >({
      query: getPeerQuery,
      variables: args
    })

    return response.data.peer
  }

  public async list(args: QueryPeersArgs) {
    const response = await this.apollo.query<
      ListPeersQuery,
      ListPeersQueryVariables
    >({
      query: listPeersQuery,
      variables: args
    })

    return response.data.peers
  }

  public async create(args: CreatePeerInput) {
    const response = await this.apollo.mutate<
      CreatePeerMutation,
      CreatePeerMutationVariables
    >({
      mutation: createPeerMutation,
      variables: {
        input: args
      }
    })

    return response.data?.createPeer
  }

  public async update(args: UpdatePeerInput) {
    const response = await this.apollo.mutate<
      UpdatePeerMutation,
      UpdatePeerMutationVariables
    >({
      mutation: updatePeerMutation,
      variables: {
        input: args
      }
    })

    return response.data?.updatePeer
  }

  public async delete(args: MutationDeletePeerArgs) {
    console.log(args)
    const response = await this.apollo.mutate<
      DeletePeerMutation,
      DeletePeerMutationVariables
    >({
      mutation: deletePeerMutation,
      variables: args
    })

    return response.data?.deletePeer
  }
}

const getPeerQuery = gql`
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
`

const listPeersQuery = gql`
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
`

const createPeerMutation = gql`
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
`

const updatePeerMutation = gql`
  mutation UpdatePeerMutation($input: UpdatePeerInput!) {
    updatePeer(input: $input) {
      code
      success
      message
    }
  }
`

const deletePeerMutation = gql`
  mutation DeletePeerMutation($id: String!) {
    deletePeer(id: $id) {
      code
      success
      message
    }
  }
`
