import {
  gql,
  type ApolloClient,
  type NormalizedCacheObject
} from '@apollo/client'
import type { QueryAssetsArgs } from '~/generated/graphql'
import type {
  ListAssetsQuery,
  ListAssetsQueryVariables
} from './__generated__/asset.server.generated'

export class AssetService {
  private apollo: ApolloClient<NormalizedCacheObject>

  constructor(apollo: ApolloClient<NormalizedCacheObject>) {
    this.apollo = apollo
  }

  public async list(args?: QueryAssetsArgs) {
    const response = await this.apollo.query<
      ListAssetsQuery,
      ListAssetsQueryVariables
    >({
      query: listAssetsQuery,
      variables: args
    })

    return response.data.assets
  }
}

const listAssetsQuery = gql`
  query ListAssetsQuery(
    $after: String
    $before: String
    $first: Int
    $last: Int
  ) {
    assets(after: $after, before: $before, first: $first, last: $last) {
      edges {
        node {
          code
          id
          scale
          withdrawalThreshold
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
