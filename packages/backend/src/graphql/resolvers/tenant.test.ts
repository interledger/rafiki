import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { createTestApp, TestContainer } from '../../tests/app'
import {
  DeleteTenantMutationResponse,
  Tenant,
  TenantMutationResponse,
  TenantsConnection,
  WhoamiResponse
} from '../generated/graphql'
import { initIocContainer } from '../..'
import { Config, IAppConfig } from '../../config/app'
import {
  createTenant,
  createTenantedApolloClient,
  generateTenantInput
} from '../../tests/tenant'
import { ApolloError, gql, NormalizedCacheObject } from '@apollo/client'
import { getPageTests } from './page.test'
import { truncateTables } from '../../tests/tableManager'
import { ApolloClient } from '@apollo/client'
import { GraphQLErrorCode } from '../errors'
import { Tenant as TenantModel } from '../../tenants/model'
import { v4 } from 'uuid'
import { errorToMessage, TenantError } from '../../tenants/errors'

describe('Tenant Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let config: IAppConfig
  const dbSchema = 'tenant_resolver_test_schema'

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer({
      ...Config,
      dbSchema
    })
    config = await deps.use('config')
    appContainer = await createTestApp(deps)
    const authServiceClient = await deps.use('authServiceClient')
    jest
      .spyOn(authServiceClient.tenant, 'create')
      .mockImplementation(async () => undefined)
    jest
      .spyOn(authServiceClient.tenant, 'update')
      .mockImplementation(async () => undefined)
    jest
      .spyOn(authServiceClient.tenant, 'delete')
      .mockImplementation(async () => undefined)
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps, { truncateTenants: true })
  })
  afterAll(async (): Promise<void> => {
    await appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('whoami', (): void => {
    test.each`
      isOperator | description
      ${true}    | ${'operator'}
      ${false}   | ${'tenant'}
    `('whoami query as $description', async ({ isOperator }): Promise<void> => {
      const tenant = await createTenant(deps)
      const client = isOperator
        ? appContainer.apolloClient
        : createTenantedApolloClient(appContainer, tenant.id)

      const result = await client
        .query({
          query: gql`
            query Whoami {
              whoami {
                id
                isOperator
              }
            }
          `
        })
        .then((query): WhoamiResponse => query.data?.whoami)

      expect(result).toEqual({
        id: isOperator ? config.operatorTenantId : tenant.id,
        isOperator,
        __typename: 'WhoamiResponse'
      })
    })
  })

  describe('Query.tenant', (): void => {
    describe('page tests', (): void => {
      getPageTests({
        getClient: () => appContainer.apolloClient,
        createModel: () => createTenant(deps),
        pagedQuery: 'tenants'
      })

      test('Cannot get page as non-operator', async (): Promise<void> => {
        const tenant = await createTenant(deps)
        const apolloClient = createTenantedApolloClient(appContainer, tenant.id)
        try {
          expect.assertions(2)
          await apolloClient
            .query({
              query: gql`
                query GetTenants {
                  tenants {
                    edges {
                      node {
                        id
                      }
                    }
                  }
                }
              `
            })
            .then((query): TenantsConnection => query.data?.tenants)
        } catch (error) {
          expect(error).toBeInstanceOf(ApolloError)
          expect((error as ApolloError).graphQLErrors).toContainEqual(
            expect.objectContaining({
              message: 'cannot get tenants page',
              extensions: expect.objectContaining({
                code: GraphQLErrorCode.Forbidden
              })
            })
          )
        }
      })
    })

    test('can get tenant as operator', async (): Promise<void> => {
      const tenant = await createTenant(deps)

      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Tenant($id: String!) {
              tenant(id: $id) {
                id
                email
              }
            }
          `,
          variables: {
            id: tenant.id
          }
        })
        .then((query): Tenant => query.data?.tenant)

      expect(query).toEqual({
        id: tenant.id,
        email: tenant.email,
        __typename: 'Tenant'
      })
    })

    test('can get own tenant', async (): Promise<void> => {
      const tenant = await createTenant(deps)
      const apolloClient = createTenantedApolloClient(appContainer, tenant.id)

      const query = await apolloClient
        .query({
          query: gql`
            query Tenant($id: String!) {
              tenant(id: $id) {
                id
                email
              }
            }
          `,
          variables: {
            id: tenant.id
          }
        })
        .then((query): Tenant => query.data?.tenant)

      expect(query).toEqual({
        id: tenant.id,
        email: tenant.email,
        __typename: 'Tenant'
      })
    })

    test('cannot get other tenant as non-operator', async (): Promise<void> => {
      const firstTenant = await createTenant(deps)
      const secondTenant = await createTenant(deps)

      const apolloClient = createTenantedApolloClient(
        appContainer,
        firstTenant.id
      )

      try {
        expect.assertions(2)
        await apolloClient
          .query({
            query: gql`
              query Tenant($id: String!) {
                tenant(id: $id) {
                  id
                  email
                }
              }
            `,
            variables: {
              id: secondTenant.id
            }
          })
          .then((query): Tenant => query.data?.tenant)
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: 'tenant does not exist',
            extensions: expect.objectContaining({
              code: GraphQLErrorCode.NotFound
            })
          })
        )
      }
    })
  })

  describe('Mutations', (): void => {
    describe('Create', (): void => {
      test('can create a tenant', async (): Promise<void> => {
        const input = generateTenantInput()

        const mutation = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation CreateTenant($input: CreateTenantInput!) {
                createTenant(input: $input) {
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
              input
            }
          })
          .then((query): TenantMutationResponse => query.data?.createTenant)

        expect(mutation.tenant).toEqual({
          ...input,
          id: expect.any(String),
          __typename: 'Tenant'
        })
      })

      test('can create a tenant with specific id', async (): Promise<void> => {
        const inputId = v4()
        const input = { ...generateTenantInput(), id: inputId }

        const mutation = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation CreateTenant($input: CreateTenantInput!) {
                createTenant(input: $input) {
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
              input
            }
          })
          .then((query): TenantMutationResponse => query.data?.createTenant)

        expect(mutation.tenant).toEqual({
          ...input,
          __typename: 'Tenant'
        })
      })

      test('cannot create tenant with invalid uuid specified', async (): Promise<void> => {
        expect.assertions(2)
        try {
          const input = { ...generateTenantInput(), id: 'invalid-id-format' }

          await appContainer.apolloClient
            .mutate({
              mutation: gql`
                mutation CreateTenant($input: CreateTenantInput!) {
                  createTenant(input: $input) {
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
                input
              }
            })
            .then((query): TenantMutationResponse => query.data?.createTenant)
        } catch (error) {
          expect(error).toBeInstanceOf(ApolloError)
          expect((error as ApolloError).graphQLErrors).toContainEqual(
            expect.objectContaining({
              message: errorToMessage[TenantError.InvalidTenantId],
              extensions: expect.objectContaining({
                code: GraphQLErrorCode.BadUserInput
              })
            })
          )
        }
      })

      test('cannot create tenant as non-operator', async (): Promise<void> => {
        const input = generateTenantInput()
        const tenant = await createTenant(deps)
        const apolloClient = createTenantedApolloClient(appContainer, tenant.id)

        try {
          expect.assertions(2)
          await apolloClient
            .mutate({
              mutation: gql`
                mutation CreateTenant($input: CreateTenantInput!) {
                  createTenant(input: $input) {
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
                input
              }
            })
            .then((query): TenantMutationResponse => query.data?.createTenant)
        } catch (error) {
          expect(error).toBeInstanceOf(ApolloError)
          expect((error as ApolloError).graphQLErrors).toContainEqual(
            expect.objectContaining({
              message: 'permission denied',
              extensions: expect.objectContaining({
                code: GraphQLErrorCode.Forbidden
              })
            })
          )
        }
      })
    })
    describe('Update', (): void => {
      let tenantedApolloClient: ApolloClient<NormalizedCacheObject>
      let tenant: TenantModel
      beforeEach(async (): Promise<void> => {
        tenant = await createTenant(deps)
        tenantedApolloClient = createTenantedApolloClient(
          appContainer,
          tenant.id
        )
      })

      afterEach(async (): Promise<void> => {
        await truncateTables(deps)
      })

      test('can update a tenant as operator', async (): Promise<void> => {
        // operator cant update apiSecret
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { apiSecret, ...input } = generateTenantInput()
        const updateInput = {
          ...input,
          id: tenant.id
        }

        const mutation = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation UpdateTenant($input: UpdateTenantInput!) {
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
              input: updateInput
            }
          })
          .then((query): TenantMutationResponse => query.data?.updateTenant)

        expect(mutation.tenant).toEqual({
          ...updateInput,
          __typename: 'Tenant',
          apiSecret: expect.any(String)
        })
      })

      test('can update a tenant as tenant', async (): Promise<void> => {
        const updateInput = {
          ...generateTenantInput(),
          id: tenant.id
        }

        const mutation = await tenantedApolloClient
          .mutate({
            mutation: gql`
              mutation UpdateTenant($input: UpdateTenantInput!) {
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
              input: updateInput
            }
          })
          .then((query): TenantMutationResponse => query.data?.updateTenant)

        expect(mutation.tenant).toEqual({
          ...updateInput,
          __typename: 'Tenant'
        })
      })

      test('Cannot update API secret as operator', async (): Promise<void> => {
        const updateInput = {
          ...generateTenantInput(),
          id: tenant.id,
          apiSecret: 'newApiSecretValue'
        }

        try {
          expect.assertions(2)
          await appContainer.apolloClient
            .mutate({
              mutation: gql`
                mutation UpdateTenant($input: UpdateTenantInput!) {
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
                input: updateInput
              }
            })
            .then((query): TenantMutationResponse => query.data?.updateTenant)
        } catch (error) {
          expect(error).toBeInstanceOf(ApolloError)
          expect((error as ApolloError).graphQLErrors).toContainEqual(
            expect.objectContaining({
              message: 'Operator cannot update apiSecret over admin api',
              extensions: expect.objectContaining({
                code: GraphQLErrorCode.BadUserInput
              })
            })
          )
        }
      })

      test('Cannot update other tenant as non-operator', async (): Promise<void> => {
        const firstTenant = await createTenant(deps)
        const secondTenant = await createTenant(deps)

        const updateInput = {
          ...generateTenantInput(),
          id: secondTenant.id
        }
        const client = createTenantedApolloClient(appContainer, firstTenant.id)
        try {
          expect.assertions(2)
          await client
            .mutate({
              mutation: gql`
                mutation UpdateTenant($input: UpdateTenantInput!) {
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
                input: updateInput
              }
            })
            .then((query): TenantMutationResponse => query.data?.updateTenant)
        } catch (error) {
          expect(error).toBeInstanceOf(ApolloError)
          expect((error as ApolloError).graphQLErrors).toContainEqual(
            expect.objectContaining({
              message: 'tenant does not exist',
              extensions: expect.objectContaining({
                code: GraphQLErrorCode.NotFound
              })
            })
          )
        }
      })
    })

    describe('Delete', (): void => {
      test('Can delete a tenant as operator', async (): Promise<void> => {
        const tenant = await createTenant(deps)

        const mutation = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation DeleteTenant($id: String!) {
                deleteTenant(id: $id) {
                  success
                }
              }
            `,
            variables: {
              id: tenant.id
            }
          })
          .then(
            (query): DeleteTenantMutationResponse => query.data?.deleteTenant
          )

        expect(mutation.success).toBe(true)
      })

      test('Cannot delete tenant as non-operator', async (): Promise<void> => {
        const firstTenant = await createTenant(deps)
        const secondTenant = await createTenant(deps)

        const client = createTenantedApolloClient(appContainer, secondTenant.id)

        try {
          expect.assertions(2)
          await client
            .mutate({
              mutation: gql`
                mutation DeleteTenant($id: String!) {
                  deleteTenant(id: $id) {
                    success
                  }
                }
              `,
              variables: {
                id: firstTenant.id
              }
            })
            .then(
              (query): DeleteTenantMutationResponse => query.data?.deleteTenant
            )
        } catch (error) {
          expect(error).toBeInstanceOf(ApolloError)
          expect((error as ApolloError).graphQLErrors).toContainEqual(
            expect.objectContaining({
              message: 'permission denied',
              extensions: expect.objectContaining({
                code: GraphQLErrorCode.Forbidden
              })
            })
          )
        }
      })
    })
  })
})
