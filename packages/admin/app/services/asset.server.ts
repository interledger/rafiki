import {
  gql,
  type ApolloClient,
  type NormalizedCacheObject
} from '@apollo/client'
import type {
  CreateAssetInput,
  QueryAssetArgs,
  QueryAssetsArgs,
  UpdateAssetInput
} from '~/generated/graphql'
import type {
  CreateAssetMutation,
  CreateAssetMutationVariables,
  GetAssetQuery,
  GetAssetQueryVariables,
  ListAssetsQuery,
  ListAssetsQueryVariables,
  UpdateAssetMutation,
  UpdateAssetMutationVariables
} from './__generated__/asset.server.generated'

export class AssetService {
  private apollo: ApolloClient<NormalizedCacheObject>

  constructor(apollo: ApolloClient<NormalizedCacheObject>) {
    this.apollo = apollo
  }

  public async get(args: QueryAssetArgs) {
    const response = await this.apollo.query<
      GetAssetQuery,
      GetAssetQueryVariables
    >({
      query: getAssetQuery,
      variables: args
    })
    return response.data.asset
  }

  public async list(args: QueryAssetsArgs) {
    const response = await this.apollo.query<
      ListAssetsQuery,
      ListAssetsQueryVariables
    >({
      query: listAssetsQuery,
      variables: args
    })

    return response.data.assets
  }

  public async create(args: CreateAssetInput) {
    const response = await this.apollo.mutate<
      CreateAssetMutation,
      CreateAssetMutationVariables
    >({
      mutation: createAssetMutation,
      variables: {
        input: args
      }
    })

    return response.data?.createAsset
  }

  public async update(args: UpdateAssetInput) {
    const response = await this.apollo.mutate<
      UpdateAssetMutation,
      UpdateAssetMutationVariables
    >({
      mutation: updateAssetMutation,
      variables: {
        input: args
      }
    })

    return response.data?.updateAssetWithdrawalThreshold
  }
}

const getAssetQuery = gql`
  query GetAssetQuery($id: String!) {
    asset(id: $id) {
      id
      code
      scale
      withdrawalThreshold
      createdAt
    }
  }
`

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

const createAssetMutation = gql`
  mutation CreateAssetMutation($input: CreateAssetInput!) {
    createAsset(input: $input) {
      code
      success
      message
      asset {
        id
      }
    }
  }
`

const updateAssetMutation = gql`
  mutation UpdateAssetMutation($input: UpdateAssetInput!) {
    updateAssetWithdrawalThreshold(input: $input) {
      code
      success
      message
    }
  }
`
