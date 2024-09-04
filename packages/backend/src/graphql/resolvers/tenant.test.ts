import { Knex } from 'knex'
import { IocContract } from '@adonisjs/fold'
import { createTestApp, TestContainer } from '../../tests/app'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config, IAppConfig } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import { getPageTests } from './page.test'
import {
  createTenant,
  mockAdminAuthApiTenantCreation
} from '../../tests/tenant'
import { ApolloError, gql } from '@apollo/client'
import { Scope } from 'nock'
import { v4 as uuidv4 } from 'uuid'
import { errorToCode, errorToMessage, TenantError } from '../../tenant/errors'
import { TenantEndpointType } from '../generated/graphql'

describe('Tenant Resolver', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let config: IAppConfig
  let scope: Scope

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = appContainer.knex
    config = await deps.use('config')
    scope = mockAdminAuthApiTenantCreation(config.authAdminApiUrl).persist()
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    scope.done()
    appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('Tenant Queries', (): void => {
    getPageTests({
      getClient: () => appContainer.apolloClient,
      createModel: async () => createTenant(deps),
      pagedQuery: 'tenants'
    })

    test('should return error if tenant does not exists', async (): Promise<void> => {
      try {
        await appContainer.apolloClient
          .query({
            query: gql`
              query GetTenant($id: ID!) {
                tenant(id: $id) {
                  id
                  name
                  kratosIdentityId
                }
              }
            `,
            variables: {
              id: uuidv4()
            }
          })
          .then((query) => {
            if (query.data) return query.data.tenant
            throw new Error('Data was empty')
          })
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: errorToMessage[TenantError.UnknownTenant],
            extensions: expect.objectContaining({
              code: errorToCode[TenantError.UnknownTenant]
            })
          })
        )
      }
    })

    test('should get correct tenant', async (): Promise<void> => {
      const tenant = await createTenant(deps)

      const response = await appContainer.apolloClient
        .query({
          query: gql`
            query GetTenant($id: ID!) {
              tenant(id: $id) {
                id
                name
                kratosIdentityId
              }
            }
          `,
          variables: {
            id: tenant.id
          }
        })
        .then((query) => {
          if (query.data) return query.data.tenant
          throw new Error('Data was empty')
        })

      expect(response).toEqual({
        __typename: 'Tenant',
        id: tenant.id,
        name: tenant.name,
        kratosIdentityId: tenant.kratosIdentityId
      })
    })
  })

  describe('Create Tenant', (): void => {
    it('should create new tenant', async (): Promise<void> => {
      const mutation = gql`
        mutation CreateTenant($input: CreateTenantInput!) {
          createTenant(input: $input) {
            tenant {
              id
              name
            }
          }
        }
      `

      const variables = {
        input: {
          name: 'My Tenant',
          idpConsentEndpoint: 'https://example.com/consent',
          idpSecret: 'myVerySecureSecret',
          endpoints: [
            {
              type: TenantEndpointType.RatesUrl,
              value: 'https://example.com/rates'
            },
            {
              type: TenantEndpointType.WebhookBaseUrl,
              value: 'https://example.com/webhook'
            }
          ]
        }
      }

      const response = await appContainer.apolloClient
        .mutate({
          mutation,
          variables
        })
        .then((query) => {
          if (query.data) return query.data.createTenant
          throw new Error('Data was empty')
        })

      expect(response.tenant).toEqual({
        __typename: 'Tenant',
        id: response.tenant.id,
        name: variables.input.name
      })
    })
  })
})
