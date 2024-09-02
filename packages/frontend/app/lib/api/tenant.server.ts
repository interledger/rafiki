import { gql } from '@apollo/client'
import type {
  GetTenantQuery,
  GetTenantQueryVariables,
  QueryTenantArgs,
  CreateTenantInput,
  CreateTenantMutation,
  CreateTenantMutationVariables,
  ListTenantsQuery,
  ListTenantsQueryVariables,
  QueryTenantsArgs
} from '~/generated/graphql'
import { apolloClient } from '../apollo.server'

export const getTenant = async (args: QueryTenantArgs, cookie?: string) => {
  const response = await apolloClient.query<
    GetTenantQuery,
    GetTenantQueryVariables
  >({
    query: gql`
      query GetTenantQuery($id: ID!) {
        tenant(id: $id) {
          id
        }
      }
    `,
    variables: args,
    context: { headers: { cookie } }
  })

  return response.data.tenant
}

export const listTenants = async (args: QueryTenantsArgs, cookie?: string) => {
  const response = await apolloClient.query<
    ListTenantsQuery,
    ListTenantsQueryVariables
  >({
    query: gql`
      query ListTenantsQuery(
        $after: String
        $before: String
        $first: Int
        $last: Int
      ) {
        tenants(after: $after, before: $before, first: $first, last: $last) {
          edges {
            node {
              id
              createdAt
              email
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
    variables: args,
    context: { headers: { cookie } }
  })

  return response.data.tenants
}

export const createTenant = async (
  args: CreateTenantInput,
  cookie?: string
) => {
  const response = await apolloClient.mutate<
    CreateTenantMutation,
    CreateTenantMutationVariables
  >({
    mutation: gql`
      mutation CreateTenantMutation($input: CreateTenantInput!) {
        createTenant(input: $input) {
          tenant {
            id
          }
        }
      }
    `,
    variables: {
      input: args
    },
    context: { headers: { cookie } }
  })

  return response.data?.createTenant
}
