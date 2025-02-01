import { IocContract } from "@adonisjs/fold"
import { AppServices } from "../../app"
import { createTestApp, TestContainer } from "../../tests/app"
import { TenantSettingService } from "../../tenants/settings/service"
import { initIocContainer } from "../.."
import { Config, IAppConfig } from "../../config/app"
import { truncateTables } from "../../tests/tableManager"
import { createTenant } from "../../tests/tenant"
import { getPageTests } from "./page.test"
import { createTenantSettings, randomSetting } from "../../tests/tenantSettings"
import { CreateTenantSettingsInput, CreateTenantSettingsMutationResponse } from "../generated/graphql"
import { ApolloClient, NormalizedCacheObject, createHttpLink, ApolloLink, InMemoryCache, gql } from "@apollo/client"
import { setContext } from "@apollo/client/link/context"

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
    let tenantSettingsService: TenantSettingService
    let config: IAppConfig

    beforeAll(async (): Promise<void> => {
        deps = initIocContainer({
            ...Config,
            dbSchema: 'tenant_settings_service_test_schema'
        })
        appContainer = await createTestApp(deps)
        config = await deps.use('config')
        tenantSettingsService = await deps.use('tenantSettingService')

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
                key: 'MY_KEY',
                value: 'MY_VALUE'
            }
            
            const tenant = await createTenant(deps)
            const client = createTenantedApolloClient(appContainer, tenant.id)
            const response = await client
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
                        return query.data
                    }
                    throw new Error('Data was empty')
                })

            expect(response.settings.length).toBeGreaterThan(0)
        })
    })

    describe('List tenant settings', (): void => {
        let tenantId: string
        beforeEach(async (): Promise<void> => {
            tenantId = (
                await createTenant(deps)
            ).id
        })
        getPageTests({
            getClient: () => appContainer.apolloClient,
            createModel: () => createTenantSettings(deps, { 
                tenantId: tenantId,
                setting: [ randomSetting() ]
            }),
            pagedQuery: 'settings',
            parent: {
                query: 'tenants',
                getId: () => tenantId
            }
        })
    })
})