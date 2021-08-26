import createLogger from 'pino'
import Knex from 'knex'
import fetch from 'cross-fetch'
import {
  ApolloClient,
  InMemoryCache,
  NormalizedCacheObject,
  createHttpLink,
  ApolloLink
} from '@apollo/client'
import { ApolloServer } from 'apollo-server'
import { createClient } from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'

import { createAdminApi } from '..'
import { AccountsService } from '../../accounts/service'
import { Config } from '../../config'
import { Logger } from '../../logger/service'
import { createKnex } from '../../Knex/service'
import { onError } from '@apollo/client/link/error'
import { setContext } from '@apollo/client/link/context'

export interface TestContainer {
  accountsService: AccountsService
  adminApi: ApolloServer
  knex: Knex
  apolloClient: ApolloClient<NormalizedCacheObject>
  shutdown: () => Promise<void>
}

export const createTestApp = async (): Promise<TestContainer> => {
  const config = Config
  config.ilpAddress = 'test.rafiki'
  config.peerAddresses = [
    {
      accountId: uuid(),
      ilpAddress: 'test.alice'
    }
  ]
  const tbClient = createClient({
    cluster_id: config.tigerbeetleClusterId,
    replica_addresses: config.tigerbeetleReplicaAddresses
  })
  const knex = await createKnex(config.postgresUrl)
  const accountsService = new AccountsService(tbClient, config, Logger)
  const adminApi = await createAdminApi({ accountsService, logger: Logger })
  const { port } = await adminApi.listen(0)

  const logger = createLogger({
    prettyPrint: {
      translateTime: true,
      ignore: 'pid,hostname'
    },
    level: process.env.LOG_LEVEL || 'error',
    name: 'test-logger'
  })

  const httpLink = createHttpLink({
    uri: `http://localhost:${port}/graphql`,
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

  const apolloClient = new ApolloClient({
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
    accountsService,
    adminApi,
    knex,
    apolloClient,
    shutdown: async () => {
      await adminApi.stop()
      await knex.destroy()
      tbClient.destroy()
    }
  }
}
