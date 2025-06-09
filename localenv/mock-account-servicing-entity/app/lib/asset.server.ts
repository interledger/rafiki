import { gql } from '@apollo/client'
import { generateApolloClient } from './apolloClient'
import type { QueryAssetsArgs } from 'generated/graphql'
import { TenantOptions } from './types'

export const listAssets = async (
  args: QueryAssetsArgs,
  tenantOptions?: TenantOptions
) => {
  const response = await generateApolloClient(tenantOptions).query({
    query: gql`
      query ListAssetsQuery(
        $after: String
        $before: String
        $first: Int
        $last: Int
        $tenantId: String
      ) {
        assets(
          after: $after
          before: $before
          first: $first
          last: $last
          tenantId: $tenantId
        ) {
          edges {
            node {
              code
              id
              scale
              withdrawalThreshold
              tenantId
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

export const loadAssets = async (tenantOptions?: TenantOptions) => {
  let assets: {
    node: {
      code: string
      id: string
      scale: number
      withdrawalThreshold?: bigint | null
      tenantId: string
      createdAt: string
    }
  }[] = []
  let hasNextPage = true
  let after: string | undefined

  while (hasNextPage) {
    const response = await listAssets(
      {
        first: 100,
        after,
        tenantId: tenantOptions?.tenantId
          ? tenantOptions.tenantId
          : process.env.OPERATOR_TENANT_ID
      },
      tenantOptions
    )

    if (response.edges) {
      assets = [...assets, ...response.edges]
    }

    hasNextPage = response.pageInfo.hasNextPage
    after = response?.pageInfo?.endCursor || assets[assets.length - 1].node.id
  }

  return assets
}
