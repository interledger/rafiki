import {
  gql,
  type ApolloClient,
  type NormalizedCacheObject
} from '@apollo/client'
import type {
  CreatePeerInput,
  QueryPeerArgs,
  QueryPeersArgs
} from '~/generated/graphql'
import type {
  CreatePeerMutation,
  CreatePeerMutationVariables,
  GetPeerQuery,
  GetPeerQueryVariables,
  ListPeersQuery,
  ListPeersQueryVariables
} from './__generated__/peer.server.generated'

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
        scale
        code
        id
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
