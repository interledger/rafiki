import {
  gql,
  type ApolloClient,
  type NormalizedCacheObject
} from '@apollo/client'
import type { CreatePeerInput, QueryPeersArgs } from '~/generated/graphql'
import type {
  CreatePeerMutation,
  CreatePeerMutationVariables,
  ListPeersQuery,
  ListPeersQueryVariables
} from './__generated__/peer.server.generated'

export class PeerService {
  private apollo: ApolloClient<NormalizedCacheObject>

  constructor(apollo: ApolloClient<NormalizedCacheObject>) {
    this.apollo = apollo
  }

  public async list(args?: QueryPeersArgs) {
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

    return response.data
  }
}

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
