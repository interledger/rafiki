import { randomBytes } from 'crypto'
import compose = require('koa-compose')
import { createClient } from 'tigerbeetle-node'
import IORedis from 'ioredis'

import { Config } from '../config'
import {
  createApp,
  Rafiki,
  RafikiRouter,
  createRatesService,
  createBalanceMiddleware,
  createIncomingErrorHandlerMiddleware,
  createIldcpProtocolController,
  createStreamController,
  createOutgoingExpireMiddleware,
  createClientController,
  createIncomingMaxPacketAmountMiddleware,
  createIncomingRateLimitMiddleware,
  createIncomingThroughputMiddleware,
  createOutgoingReduceExpiryMiddleware,
  createOutgoingThroughputMiddleware,
  createOutgoingValidateFulfillmentMiddleware
} from './core'
import { Logger } from '../logger/service'
import { AdminApi } from '../admin-api'
import { AccountsService } from '../accounts/service'

/**
 * Admin API Variables
 */
const ADMIN_API_HOST = process.env.ADMIN_API_HOST || '127.0.0.1'
const ADMIN_API_PORT = parseInt(process.env.ADMIN_API_PORT || '3001', 10)

/**
 * Connector variables
 */
const ILP_ADDRESS = process.env.ILP_ADDRESS || undefined
const STREAM_SECRET = process.env.STREAM_SECRET
  ? Buffer.from(process.env.STREAM_SECRET, 'base64')
  : randomBytes(32)
const pricesUrl = process.env.PRICES_URL // optional
const pricesLifetime = +(process.env.PRICES_LIFETIME || 15_000)

export interface ConnectorService {
  adminApi: AdminApi
  app: Rafiki
}

interface ServiceDependencies {
  redis: IORedis.Redis
}

export async function createConnectorService({
  redis
}: ServiceDependencies): Promise<ConnectorService> {
  const log = Logger.child({
    service: 'ConnectorService'
  })

  if (!ILP_ADDRESS) {
    throw new Error('ILP_ADDRESS is required')
  }

  const incoming = compose([
    // Incoming Rules
    createIncomingErrorHandlerMiddleware(ILP_ADDRESS),
    createIncomingMaxPacketAmountMiddleware(),
    createIncomingRateLimitMiddleware({}),
    createIncomingThroughputMiddleware()
  ])

  const outgoing = compose([
    // Outgoing Rules
    createStreamController(),
    createOutgoingThroughputMiddleware(),
    createOutgoingReduceExpiryMiddleware({}),
    createOutgoingExpireMiddleware(),
    createOutgoingValidateFulfillmentMiddleware(),

    // Send outgoing packets
    createClientController()
  ])

  const ratesService = createRatesService({
    pricesUrl,
    pricesLifetime,
    logger: Logger
  })
  const middleware = compose([incoming, createBalanceMiddleware(), outgoing])

  const tbClient = createClient({
    cluster_id: Config.tigerbeetleClusterId,
    replica_addresses: Config.tigerbeetleReplicaAddresses
  })

  const accountsService = new AccountsService(tbClient, Config, log)

  const adminApi = new AdminApi(
    { host: ADMIN_API_HOST, port: ADMIN_API_PORT },
    {
      auth: (): boolean => {
        return true
      },
      accounts: accountsService
      //router: router
    }
  )
  // TODO Add auth
  const app = createApp({
    //router: router,
    accounts: accountsService,
    redis,
    rates: ratesService,
    stream: {
      serverSecret: STREAM_SECRET,
      serverAddress: ILP_ADDRESS
    }
  })

  const appRouter = new RafikiRouter()

  // Default ILP routes
  // TODO Understand the priority and workings of the router... Seems to do funky stuff. Maybe worth just writing ILP one?
  appRouter.ilpRoute('test.*', middleware)
  appRouter.ilpRoute('peer.config', createIldcpProtocolController(ILP_ADDRESS))
  //appRouter.ilpRoute('peer.route.*', createCcpProtocolController())
  // TODO Handle echo
  app.use(appRouter.routes())

  return {
    adminApi,
    app
  }
}
