import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { createTestApp, TestContainer } from '../../tests/app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import { createTenant } from '../../tests/tenant'
import {
  CreateTenantSettingsInput,
  CreateTenantSettingsMutationResponse
} from '../generated/graphql'
import {
  ApolloClient,
  NormalizedCacheObject,
  createHttpLink,
  ApolloLink,
  InMemoryCache,
  gql,
  ApolloError
} from '@apollo/client'
import { setContext } from '@apollo/client/link/context'
import { TenantSettingKeys } from '../../tenants/settings/model'
import { faker } from '@faker-js/faker'
import {
  errorToCode,
  errorToMessage,
  TenantSettingError
} from '../../tenants/settings/errors'

function createTenantedApolloClient(
  appContainer: TestContainer,
  tenantId: string
): ApolloClient<NormalizedCacheObject> {
  const httpLink = createHttpLink({
    uri: `http://localhost:${appContainer.app.getAdminPort()}/graphql`,
    fetch
  })
  const authLink = setContext((_, { headers }) => {
    return {
      headers: {
        ...headers,
        'tenant-id': tenantId
      }
    }
  })

  const link = ApolloLink.from([authLink, httpLink])

  return new ApolloClient({
    cache: new InMemoryCache({}),
    link: link,
    defaultOptions: {
      query: {
        fetchPolicy: 'no-cache'
      },
      mutate: {
        fetchPolicy: 'no-cache'
      },
      watchQuery: {
        fetchPolicy: 'no-cache'
      }
    }
  })
}

describe('Tenant Settings Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  const dbSchema = 'tenant_settings_resolver_test_schema'

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({
      ...Config,
      dbSchema
    })
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
    appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('Create Tenant Settings', (): void => {
    test('can create tenant setting', async (): Promise<void> => {
      const input: CreateTenantSettingsInput = {
        settings: [
          {
            key: TenantSettingKeys.EXCHANGE_RATES_URL.name,
            value: faker.internet.url()
          }
        ]
      }

      const tenant = await createTenant(deps)
      const client = createTenantedApolloClient(appContainer, tenant.id)
      const response = await client
        .mutate({
          mutation: gql`
            mutation CreateTenantSettings($input: CreateTenantSettingsInput!) {
              createTenantSettings(input: $input) {
                settings {
                  key
                  value
                }
              }
            }
          `,
          variables: { input }
        })
        .then((query): CreateTenantSettingsMutationResponse => {
          if (query.data) {
            return query.data.createTenantSettings
          }
          throw new Error('Data was empty')
        })

      expect(response.settings.length).toBeGreaterThan(0)
    })

    test('errors when invalid input is provided', async (): Promise<void> => {
      const input: CreateTenantSettingsInput = {
        settings: [
          {
            key: TenantSettingKeys.WEBHOOK_MAX_RETRY.name,
            value: '-1'
          }
        ]
      }

      const tenant = await createTenant(deps)
      const client = createTenantedApolloClient(appContainer, tenant.id)
      expect.assertions(2)

      try {
        await client
          .mutate({
            mutation: gql`
              mutation CreateTenantSettings(
                $input: CreateTenantSettingsInput!
              ) {
                createTenantSettings(input: $input) {
                  settings {
                    key
                    value
                  }
                }
              }
            `,
            variables: { input }
          })
          .then((query): CreateTenantSettingsMutationResponse => {
            if (query.data) {
              return query.data.createTenantSettings
            }
            throw new Error('Data was empty')
          })
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: errorToMessage[TenantSettingError.InvalidSetting],
            extensions: expect.objectContaining({
              code: errorToCode[TenantSettingError.InvalidSetting]
            })
          })
        )
      }
    })
  })

  describe('Get Tenant Settings', (): void => {
    test('can get tenant settings', async (): Promise<void> => {
      const tenant = await createTenant(deps)
      const client = createTenantedApolloClient(appContainer, tenant.id)

      // Query the settings
      const response = await client
        .query({
          query: gql`
            query GetTenantSettings($id: String!) {
              tenant(id: $id) {
                settings {
                  key
                  value
                }
              }
            }
          `,
          variables: { id: tenant.id }
        })
        .then((query): { key: string; value: string }[] => {
          if (query.data && query.data.tenant) {
            return query.data.tenant.settings
          }
          throw new Error('Data was empty')
        })

      expect(response.length).toBeGreaterThan(0)
      expect(response).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: TenantSettingKeys.WEBHOOK_MAX_RETRY.name,
            value: String(TenantSettingKeys.WEBHOOK_MAX_RETRY.default)
          }),
          expect.objectContaining({
            key: TenantSettingKeys.WEBHOOK_TIMEOUT.name,
            value: String(TenantSettingKeys.WEBHOOK_TIMEOUT.default)
          })
        ])
      )
    })
  })
})
