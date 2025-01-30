import { gql } from '@apollo/client'
import type {
  CreateTenantInput,
  CreateTenantMutation,
  CreateTenantMutationVariables,
  QueryTenantsArgs,
  ListTenantsQuery,
  ListTenantsQueryVariables
} from '~/generated/graphql'
import { getApolloClient } from '../apollo.server'

export const listTenants = async (request: Request, args: QueryTenantsArgs) => {
  const apolloClient = await getApolloClient(request)
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
              email
              apiSecret
              idpConsentUrl
              idpSecret
              publicName
              createdAt
              deletedAt
              isOperator
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
  return response.data.tenants
}

export const createTenant = async (
  request: Request,
  args: CreateTenantInput
) => {
  const apolloClient = await getApolloClient(request)
  const response = await apolloClient.mutate<
    CreateTenantMutation,
    CreateTenantMutationVariables
  >({
    mutation: gql`
      mutation CreateTenantMutation($input: CreateTenantInput!) {
        createTenant(input: $input) {
          tenant {
            id
            publicName
            email
            apiSecret
            idpConsentUrl
            idpSecret
          }
        }
      }
    `,
    variables: {
      input: args
    }
  })

  return response.data?.createTenant
}

export const updateTenant = async (
  request: Request,
  args: UpdateTenantInput
) => {
  const apolloClient = await getApolloClient(request)
  const response = await apolloClient.mutate<
    UpdateTenantMutation,
    UpdateTenantMutationVariables
  >({
    mutation: gql`
      mutation UpdateTenantMutation($input: UpdateTenantInput!) {
        updateTenant(input: $input) {
          tenant {
            id
            email
            apiSecret
            idpConsentUrl
            idpSecret
            publicName
          }
        }
      }
    `,
    variables: {
      input: args
    }
  })

  return response.data?.updateTenant
}

export const deleteTenant = async (request: Request, args: string) => {
  const apolloClient = await getApolloClient(request)
  const response = await apolloClient.mutate<
    DeleteTenantMutation,
    DeleteTenantMutationVariables
  >({
    mutation: gql`
      mutation DeleteTenantMutation($id: String!) {
        deleteTenant(id: $id) {
          success
        }
      }
    `,
    variables: {
      id: args
    }
  })

  return response.data?.deleteTenant
}

export const getTenantInfo = async (
  request: Request,
  args: QueryTenantArgs
) => {
  const apolloClient = await getApolloClient(request)
  const response = await apolloClient.query<
    GetTenantQuery,
    GetTenantQueryVariables
  >({
    query: gql`
      query GetTenantQuery($id: String!) {
        tenant(id: $id) {
          id
          email
          apiSecret
          idpConsentUrl
          idpSecret
          publicName
          createdAt
          deletedAt
          isOperator
        }
      }
    `,
    variables: args
  })
  return response.data.tenant
}
