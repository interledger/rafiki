import { gql } from '@apollo/client'
import type {
  CreateAssetInput,
  CreateAssetMutation,
  CreateAssetMutationVariables,
  GetAssetQuery,
  GetAssetQueryVariables,
  ListAssetsQuery,
  ListAssetsQueryVariables,
  QueryAssetArgs,
  QueryAssetsArgs,
  UpdateAssetInput,
  UpdateAssetMutation,
  UpdateAssetMutationVariables
} from '~/generated/graphql'
import { apolloClient } from '../apollo.server'

export const getAsset = async (args: QueryAssetArgs) => {
  const response = await apolloClient.query<
    GetAssetQuery,
    GetAssetQueryVariables
  >({
    query: gql`
      query GetAssetQuery($id: String!) {
        asset(id: $id) {
          id
          code
          scale
          withdrawalThreshold
          createdAt
        }
      }
    `,
    variables: args
  })
  return response.data.asset
}

export const listAssets = async (args: QueryAssetsArgs) => {
  const response = await apolloClient.query<
    ListAssetsQuery,
    ListAssetsQueryVariables
  >({
    query: gql`
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
              createdAt
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

  return response.data.assets
}

export const createAsset = async (args: CreateAssetInput) => {
  const response = await apolloClient.mutate<
    CreateAssetMutation,
    CreateAssetMutationVariables
  >({
    mutation: gql`
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
    `,
    variables: {
      input: args
    }
  })

  return response.data?.createAsset
}

export const updateAsset = async (args: UpdateAssetInput) => {
  const response = await apolloClient.mutate<
    UpdateAssetMutation,
    UpdateAssetMutationVariables
  >({
    mutation: gql`
      mutation UpdateAssetMutation($input: UpdateAssetInput!) {
        updateAssetWithdrawalThreshold(input: $input) {
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

  return response.data?.updateAssetWithdrawalThreshold
}
