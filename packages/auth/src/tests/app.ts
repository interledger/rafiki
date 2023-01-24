import { Knex } from 'knex'
import { IocContract } from '@adonisjs/fold'
import createLogger from 'pino'
import fetch from 'cross-fetch'
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

export interface TestContainer {
  port: number
  adminPort: number
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
  config.authPort = 0

  const logger = createLogger({
    transport: {
      target: 'pino-pretty',
      options: {
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
    port: app.getPort(),
    adminPort: app.getAdminPort(),
    knex,
    apolloClient: client,
    connectionUrl: config.databaseUrl,
    shutdown: async () => {
      await gracefulShutdown(container, app)
    },
    container
  }
}
