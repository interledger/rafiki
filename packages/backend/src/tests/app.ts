import Axios from 'axios'
import { v4 } from 'uuid'
import { Knex } from 'knex'
import fetch from 'cross-fetch'
import { IocContract } from '@adonisjs/fold'
import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  NormalizedCacheObject,
  createHttpLink
} from '@apollo/client'
import { setContext } from '@apollo/client/link/context'
import { start, gracefulShutdown } from '..'
import { onError } from '@apollo/client/link/error'

import { App, AppServices } from '../app'

export const testAccessToken = 'test-app-access'

export interface TestContainer {
  adminPort: number
  openPaymentsPort: number
  app: App
  knex: Knex
  apolloClient: ApolloClient<NormalizedCacheObject>
  connectionUrl: string
  shutdown: () => Promise<void>
  container: IocContract<AppServices>
}

export const createTestApp = async (
  container: IocContract<AppServices>
): Promise<TestContainer> => {
  const config = await container.use('config')
  config.adminPort = 0
  config.openPaymentsPort = 0
  config.connectorPort = 0
  config.autoPeeringServerPort = 0
  config.openPaymentsUrl = 'https://op.example'
  config.walletAddressUrl = 'https://wallet.example/.well-known/pay'
  const logger = await container.use('logger')

  const nock = (global as unknown as { nock: typeof import('nock') }).nock
  nock(config.kratosAdminUrl)
    .get('/identities')
    .query({ credentials_identifier: config.kratosAdminEmail })
    .reply(200, [{ metadata_public: { operator: true }, id: v4() }])
    .persist()

  nock(config.kratosAdminUrl)
    .post('/recovery/link')
    .reply(200, { recovery_link: 'https://example.com' })
    .persist()

  nock(config.authAdminApiUrl)
    .post('')
    .reply(200, { data: { createAuthTenant: { success: true } } })
    .persist()

  const app = new App(container)
  await start(container, app)

  // Since wallet addresses MUST use HTTPS, manually mock an HTTPS proxy to the Open Payments / SPSP server
  nock(config.openPaymentsUrl)
    .get(/.*/)
    .matchHeader('Accept', /application\/((ilp-stream|spsp4)\+)?json*./)
    .reply(200, function (path) {
      return Axios.get(`http://localhost:${app.getOpenPaymentsPort()}${path}`, {
        headers: this.req.headers
      }).then((res) => res.data)
    })
    .persist()
  const knex = await container.use('knex')

  const httpLink = createHttpLink({
    uri: `http://localhost:${app.getAdminPort()}/graphql`,
    fetch
  })
  const errorLink = onError(({ graphQLErrors }) => {
    if (graphQLErrors) {
      logger.error(graphQLErrors)
      graphQLErrors.map(({ extensions }) => {
        if (extensions && extensions.code === 'UNAUTHENTICATED') {
          logger.error('UNAUTHENTICATED')
        }

        if (extensions && extensions.code === 'FORBIDDEN') {
          logger.error('FORBIDDEN')
        }
      })
    }
  })
  const authLink = setContext((_, { headers }) => {
    return {
      // TODO: enable testing resolvers as tenant? This (and nock)
      // configuration makes all requests as-if from operator. Override with
      // new optional createTestApp config?
      headers: {
        'x-operator-secret': config.operatorApiSecret,
        ...headers
      }
    }
  })

  const link = ApolloLink.from([errorLink, authLink, httpLink])

  const client = new ApolloClient({
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

  return {
    app,
    adminPort: app.getAdminPort(),
    openPaymentsPort: app.getOpenPaymentsPort(),
    knex,
    apolloClient: client,
    connectionUrl: config.databaseUrl,
    shutdown: async () => {
      nock.cleanAll()
      nock.abortPendingRequests()
      nock.restore()
      nock.activate()

      client.stop()
      await gracefulShutdown(container, app)
    },
    container
  }
}
