import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { createTestApp, TestContainer } from '../../tests/app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import { createTenant } from '../../tests/tenant'
import {
  CreateTenantSettingsInput,
  CreateTenantSettingsMutationResponse,
} from '../generated/graphql'
import {
  ApolloClient,
  NormalizedCacheObject,
  createHttpLink,
  ApolloLink,
  InMemoryCache,
  gql
} from '@apollo/client'
import { setContext } from '@apollo/client/link/context'
import { TenantSettingKeys } from '../../tenants/settings/model'

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

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({
      ...Config,
      dbSchema: 'tenant_settings_service_test_schema'
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
    await truncateTables(appContainer.knex, true)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('Create Tenant Settings', (): void => {
    test('can create tenant setting', async (): Promise<void> => {
      const input: CreateTenantSettingsInput = {
        settings: [{ key: TenantSettingKeys.EXCHANGE_RATES_URL.name, value: 'MY_VALUE' }]
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
  })
})
