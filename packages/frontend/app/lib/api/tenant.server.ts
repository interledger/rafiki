import { gql } from '@apollo/client'
import type {
  CreateTenantInput,
  CreateTenantMutation,
  UpdateTenantMutationVariables,
  UpdateTenantInput,
  UpdateTenantMutation,
  CreateTenantMutationVariables,
  QueryTenantsArgs,
  ListTenantsQuery,
  ListTenantsQueryVariables,
  DeleteTenantMutationVariables,
  DeleteTenantMutation,
  QueryTenantArgs,
  GetTenantQuery,
  GetTenantQueryVariables,
  WhoAmI,
  WhoAmIVariables
} from '~/generated/graphql'
import { getApolloClient } from '../apollo.server'

export const whoAmI = async (request: Request) => {
  const apolloClient = await getApolloClient(request)
  const response = await apolloClient.query<WhoAmI, WhoAmIVariables>({
    query: gql`
      query WhoAmI {
        whoami {
          id
          isOperator
        }
      }
    `
  })

  return response.data.whoami
}

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
        }
      }
    `,
    variables: args
  })
  return response.data.tenant
}

export const loadTenants = async (request: Request) => {
  let tenants: ListTenantsQuery['tenants']['edges'] = []
  let hasNextPage = true
  let after: string | undefined

  while (hasNextPage) {
    const response = await listTenants(request, { first: 100, after })

    if (!response.edges.length) {
      return []
    }
    if (response.edges) {
      tenants = [...tenants, ...response.edges]
    }

    hasNextPage = response.pageInfo.hasNextPage
    after = response?.pageInfo?.endCursor || tenants[tenants.length - 1].node.id
  }

  return tenants
}
