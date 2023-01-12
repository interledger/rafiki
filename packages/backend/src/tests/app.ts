import Axios from 'axios'
import createLogger from 'pino'
import { Knex } from 'knex'
import nock from 'nock'
import fetch from 'cross-fetch'
import { IocContract } from '@adonisjs/fold'
import {
  ApolloClient,
  InMemoryCache,
  NormalizedCacheObject,
  createHttpLink,
  ApolloLink
} from '@apollo/client'
import { onError } from '@apollo/client/link/error'
import { setContext } from '@apollo/client/link/context'

import { start, gracefulShutdown } from '..'
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
}

export const createTestApp = async (
  container: IocContract<AppServices>
): Promise<TestContainer> => {
  const config = await container.use('config')
  config.adminPort = 0
  config.openPaymentsPort = 0
  config.connectorPort = 0
  config.publicHost = 'https://wallet.example'
  config.openPaymentsUrl = 'https://op.example'
  config.paymentPointerUrl = 'https://wallet.example/.well-known/pay'
  const logger = createLogger({
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: true,
        ignore: 'pid,hostname'
      }
    },
    level: process.env.LOG_LEVEL || 'error',
    name: 'test-logger'
  })

  container.bind('logger', async () => logger)

  const app = new App(container)
  await start(container, app)

  // Since payment pointers MUST use HTTPS, manually mock an HTTPS proxy to the Open Payments / SPSP server
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
      headers: {
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
      await gracefulShutdown(container, app)
    }
  }
}
