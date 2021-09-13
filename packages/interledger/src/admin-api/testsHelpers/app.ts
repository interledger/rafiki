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
import { createAssetService } from '../../asset/service'
import { createBalanceService } from '../../balance/service'
import { createCreditService, CreditService } from '../../credit/service'
import { createDepositService, DepositService } from '../../deposit/service'
import { createTransferService, TransferService } from '../../transfer/service'
import {
  createWithdrawalService,
  WithdrawalService
} from '../../withdrawal/service'
import { Config } from '../../config'
import { Logger } from '../../logger/service'
import { createKnex } from '../../Knex/service'
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
  const balanceService = createBalanceService({ tbClient, logger: Logger })
  const assetService = createAssetService({ balanceService, logger: Logger })
  const accountsService = new AccountsService(
    assetService,
    balanceService,
    config,
    Logger
  )
  const creditService = createCreditService({ balanceService, logger: Logger })
  const depositService = createDepositService({
    assetService,
    balanceService,
    logger: Logger
  })
  const transferService = createTransferService({
    balanceService,
    logger: Logger
  })
  const withdrawalService = createWithdrawalService({
    assetService,
    balanceService,
    logger: Logger
  })
  const adminApi = await createAdminApi({
    accountsService,
    creditService,
    depositService,
    transferService,
    withdrawalService,
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
    accountsService,
    creditService,
    depositService,
    transferService,
    withdrawalService,
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
