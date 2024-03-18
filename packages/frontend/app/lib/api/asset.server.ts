import { gql } from '@apollo/client'
import type {
  DepositAssetLiquidityInput,
  DepositAssetLiquidityMutation,
  DepositAssetLiquidityMutationVariables,
  CreateAssetInput,
  CreateAssetLiquidityWithdrawalInput,
  CreateAssetMutation,
  CreateAssetMutationVariables,
  GetAssetQuery,
  GetAssetQueryVariables,
  GetAssetWithFeesQuery,
  GetAssetWithFeesQueryVariables,
  ListAssetsQuery,
  ListAssetsQueryVariables,
  QueryAssetArgs,
  QueryAssetsArgs,
  SetFeeInput,
  SetFeeMutation,
  SetFeeMutationVariables,
  UpdateAssetInput,
  UpdateAssetMutation,
  UpdateAssetMutationVariables,
  WithdrawAssetLiquidity,
  WithdrawAssetLiquidityVariables
} from '~/generated/graphql'
import { getApolloClient } from '../apollo.server'
import { maybeThrowUnauthenticatedError } from '~/shared/utils'

export const getAssetInfo = async (args: QueryAssetArgs, apiToken: string) => {
  try {
    const apolloClient = getApolloClient(apiToken)
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
            liquidity
            sendingFee {
              basisPoints
              fixed
              createdAt
            }
            createdAt
          }
        }
      `,
      variables: args
    })
    return response.data.asset
  } catch (error) {
    maybeThrowUnauthenticatedError(error)
    throw error
  }
}

export const getAssetWithFees = async (
  args: QueryAssetArgs,
  apiToken: string
) => {
  try {
    const apolloClient = getApolloClient(apiToken)
    const response = await apolloClient.query<
      GetAssetWithFeesQuery,
      GetAssetWithFeesQueryVariables
    >({
      query: gql`
        query GetAssetWithFeesQuery(
          $id: String!
          $after: String
          $before: String
          $first: Int
          $last: Int
        ) {
          asset(id: $id) {
            fees(after: $after, before: $before, first: $first, last: $last) {
              edges {
                cursor
                node {
                  assetId
                  basisPoints
                  createdAt
                  fixed
                  id
                  type
                }
              }
              pageInfo {
                endCursor
                hasNextPage
                hasPreviousPage
                startCursor
              }
            }
          }
        }
      `,
      variables: args
    })
    return response.data.asset
  } catch (error) {
    maybeThrowUnauthenticatedError(error)
    throw error
  }
}

export const listAssets = async (args: QueryAssetsArgs, apiToken: string) => {
  try {
    const apolloClient = getApolloClient(apiToken)
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
  } catch (error) {
    maybeThrowUnauthenticatedError(error)
    throw error
  }
}

export const createAsset = async (args: CreateAssetInput, apiToken: string) => {
  try {
    const apolloClient = getApolloClient(apiToken)
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
  } catch (error) {
    maybeThrowUnauthenticatedError(error)
    throw error
  }
}

export const updateAsset = async (args: UpdateAssetInput, apiToken: string) => {
  try {
    const apolloClient = getApolloClient(apiToken)
    const response = await apolloClient.mutate<
      UpdateAssetMutation,
      UpdateAssetMutationVariables
    >({
      mutation: gql`
        mutation UpdateAssetMutation($input: UpdateAssetInput!) {
          updateAsset(input: $input) {
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

    return response.data?.updateAsset
  } catch (error) {
    maybeThrowUnauthenticatedError(error)
    throw error
  }
}

export const setFee = async (args: SetFeeInput, apiToken: string) => {
  try {
    const apolloClient = getApolloClient(apiToken)
    const response = await apolloClient.mutate<
      SetFeeMutation,
      SetFeeMutationVariables
    >({
      mutation: gql`
        mutation SetFeeMutation($input: SetFeeInput!) {
          setFee(input: $input) {
            code
            fee {
              assetId
              basisPoints
              createdAt
              fixed
              id
              type
            }
            message
            success
          }
        }
      `,
      variables: {
        input: args
      }
    })

    return response.data?.setFee
  } catch (error) {
    maybeThrowUnauthenticatedError(error)
    throw error
  }
}

export const depositAssetLiquidity = async (
  args: DepositAssetLiquidityInput,
  apiToken: string
) => {
  try {
    const apolloClient = getApolloClient(apiToken)
    const response = await apolloClient.mutate<
      DepositAssetLiquidityMutation,
      DepositAssetLiquidityMutationVariables
    >({
      mutation: gql`
        mutation DepositAssetLiquidityMutation(
          $input: DepositAssetLiquidityInput!
        ) {
          depositAssetLiquidity(input: $input) {
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

    return response.data?.depositAssetLiquidity
  } catch (error) {
    maybeThrowUnauthenticatedError(error)
    throw error
  }
}

export const withdrawAssetLiquidity = async (
  args: CreateAssetLiquidityWithdrawalInput,
  apiToken: string
) => {
  try {
    const apolloClient = getApolloClient(apiToken)
    const response = await apolloClient.mutate<
      WithdrawAssetLiquidity,
      WithdrawAssetLiquidityVariables
    >({
      mutation: gql`
        mutation WithdrawAssetLiquidity(
          $input: CreateAssetLiquidityWithdrawalInput!
        ) {
          createAssetLiquidityWithdrawal(input: $input) {
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

    return response.data?.createAssetLiquidityWithdrawal
  } catch (error) {
    maybeThrowUnauthenticatedError(error)
    throw error
  }
}

export const loadAssets = async (apiToken: string) => {
  let assets: ListAssetsQuery['assets']['edges'] = []
  let hasNextPage = true
  let after: string | undefined

  while (hasNextPage) {
    const response = (await listAssets(
      { first: 100, after },
      apiToken
    )) as ListAssetsQuery['assets']

    if (response.edges) {
      assets = [...assets, ...response.edges]
    }

    hasNextPage = response.pageInfo.hasNextPage
    after = response?.pageInfo?.endCursor || assets[assets.length - 1].node.id
  }

  return assets
}
