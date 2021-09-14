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

import { createAdminApi } from '..'
import { AccountsService } from '../../accounts/service'
import { CreditService } from '../../credit/service'
import { DepositService } from '../../deposit/service'
import { TransferService } from '../../transfer/service'
import { WithdrawalService } from '../../withdrawal/service'
import { createTestServices } from '../../testsHelpers/services'
import { Logger } from '../../logger/service'
import { onError } from '@apollo/client/link/error'
import { setContext } from '@apollo/client/link/context'

export interface TestContainer {
  accountsService: AccountsService
  creditService: CreditService
  depositService: DepositService
  transferService: TransferService
  withdrawalService: WithdrawalService
  adminApi: ApolloServer
  knex: Knex
  apolloClient: ApolloClient<NormalizedCacheObject>
  shutdown: () => Promise<void>
}

export const createTestApp = async (): Promise<TestContainer> => {
  const services = await createTestServices()
  const adminApi = await createAdminApi({
    ...services,
    logger: Logger
  })
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
    ...services,
    adminApi,
    apolloClient,
    shutdown: async () => {
      await adminApi.stop()
      await services.shutdown()
    }
  }
}
