import { gql } from '@apollo/client'
import type {
  GetTenantQuery,
  GetTenantQueryVariables,
  QueryTenantArgs,
  CreateTenantInput,
  CreateTenantMutation,
  CreateTenantMutationVariables,
  DeleteTenantInput,
  DeleteTenantMutation,
  DeleteTenantMutationVariables,
  ListTenantsQuery,
  ListTenantsVariables,
  QueryTenantsArgs
} from '~/generated/graphql'
import { apolloClient } from '../apollo.server'

export const getTenant = async (args: QueryTenantArgs, cookie?: string) => {
  const response = await apolloClient.query<
    GetTenantQuery,
    GetTenantQueryVariables
  >({
    query: gql`
      query GetTenantQuery($id: String!) {
        tenant(id: $id) {
          id
          email
          idpConsentUrl
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
    ListTenantsVariables
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
              email
              idpConsentUrl
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
            email
            idpConsentUrl
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

export const deleteTenant = async (
  args: DeleteTenantInput,
  cookie?: string
) => {
  const response = await apolloClient.mutate<
    DeleteTenantMutation,
    DeleteTenantMutationVariables
  >({
    mutation: gql`
      mutation DeleteTenantMutation($input: DeleteTenantInput!) {
        deleteTenant(input: $input) {
          tenant {
            id
            email
            idpConsentUrl
          }
        }
      }
    `,
    variables: {
      input: args
    },
    context: { headers: { cookie } }
  })

  return response.data?.deleteTenant
}
