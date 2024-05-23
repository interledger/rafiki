import { gql } from '@apollo/client'
import { apolloClient } from './apolloClient'
import type { QueryAssetsArgs } from 'generated/graphql'

export const listAssets = async (args: QueryAssetsArgs) => {
  const response = await apolloClient.query({
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

export const loadAssets = async () => {
  let assets: {
    node: {
      code: string
      id: string
      scale: number
      withdrawalThreshold?: bigint | null
      createdAt: string
    }
  }[] = []
  let hasNextPage = true
  let after: string | undefined

  while (hasNextPage) {
    const response = await listAssets({ first: 100, after })

    if (response.edges) {
      assets = [...assets, ...response.edges]
    }

    hasNextPage = response.pageInfo.hasNextPage
    after = response?.pageInfo?.endCursor || assets[assets.length - 1].node.id
  }

  return assets
}
