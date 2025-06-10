import { IocContract } from '@adonisjs/fold'
import { faker } from '@faker-js/faker'
import { AppServices } from '../app'
import { Tenant } from '../tenants/model'
import {
  ApolloClient,
  ApolloLink,
  createHttpLink,
  InMemoryCache,
  NormalizedCacheObject
} from '@apollo/client'
import { setContext } from '@apollo/client/link/context'
import { TestContainer } from './app'
import { isTenantError } from '../tenants/errors'

interface CreateOptions {
  email: string
  publicName?: string
  apiSecret: string
  idpConsentUrl: string
  idpSecret: string
}

export function createTenantedApolloClient(
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

export function generateTenantInput() {
  return {
    email: faker.internet.email(),
    apiSecret: faker.string.alphanumeric(8),
    idpConsentUrl: faker.internet.url(),
    idpSecret: faker.string.alphanumeric(8),
    publicName: faker.company.name()
  }
}

export async function createTenant(
  deps: IocContract<AppServices>,
  options?: CreateOptions
): Promise<Tenant> {
  const tenantService = await deps.use('tenantService')
  const authServiceClient = await deps.use('authServiceClient')
  jest
    .spyOn(authServiceClient.tenant, 'create')
    .mockImplementationOnce(async () => undefined)
  const tenantOrError = await tenantService.create(
    options || {
      email: faker.internet.email(),
      apiSecret: 'test-api-secret',
      publicName: faker.company.name(),
      idpConsentUrl: faker.internet.url(),
      idpSecret: 'test-idp-secret'
    }
  )

  if (!tenantOrError || isTenantError(tenantOrError)) {
    throw Error('Failed to create test tenant')
  }

  return tenantOrError
}
