import createLogger from 'pino'
import Knex from 'knex'
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
import { ConnectorService } from '../connector/service'

import { start, gracefulShutdown } from '..'
import { App, AppServices } from '../app'
import { IlpAccount } from '../connector/generated/graphql'
import { v4 } from 'uuid'

export interface TestContainer {
  port: number
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
  config.env = 'test'
  config.port = 0
  config.adminPort = 0
  const logger = createLogger({
    prettyPrint: {
      translateTime: true,
      ignore: 'pid,hostname'
    },
    level: process.env.LOG_LEVEL || 'error',
    name: 'test-logger'
  })

  container.bind('logger', async () => logger)

  container.bind('connectorService', async () => {
    return await createMockConnectorService()
  })

  const app = new App(container)
  await start(container, app)
  const knex = await container.use('knex')

  const httpLink = createHttpLink({
    uri: `http://localhost:${app.getPort()}/graphql`,
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
    knex,
    apolloClient: client,
    connectionUrl: config.databaseUrl,
    shutdown: async () => {
      await gracefulShutdown(container, app)
    }
  }
}

export async function createMockConnectorService(): Promise<ConnectorService> {
  // TODO: store the mock accounts in a database
  return {
    getIlpAccount: async (id) => {
      const account = ({
        __typename: 'IlpAccount',
        id: id,
        enabled: true,
        subAccounts: null,
        maxPacketAmount: '3'
      } as unknown) as IlpAccount
      return account
    },
    createIlpAccount: async () => {
      const account = ({
        __typename: 'IlpAccount',
        id: v4(),
        enabled: true,
        subAccounts: null,
        maxPacketAmount: '3'
      } as unknown) as IlpAccount
      return {
        ilpAccount: account,
        code: '200',
        message: 'OK',
        success: true
      }
    },
    createIlpSubAccount: async (superAccountId) => {
      const account = ({
        __typename: 'IlpAccount',
        id: v4(),
        superAccountId: superAccountId,
        enabled: true,
        subAccounts: null,
        maxPacketAmount: '3'
      } as unknown) as IlpAccount
      return {
        ilpAccount: account,
        code: '200',
        message: 'OK',
        success: true
      }
    },
    extendCredit: async (_input) => {
      return {
        code: '200',
        message: 'OK',
        success: true
      }
    },
    settleDebt: async (_input) => {
      return {
        code: '200',
        message: 'OK',
        success: true
      }
    }
  }
}
