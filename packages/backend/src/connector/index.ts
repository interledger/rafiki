import compose = require('koa-compose')
import IORedis from 'ioredis'
import { StreamServer } from '@interledger/stream-receiver'

import {
  createApp,
  Rafiki,
  RafikiRouter,
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
import { AccountService } from '../account/service'
import { RatesService } from '../rates/service'
import { BaseService } from '../shared/baseService'

interface ServiceDependencies extends BaseService {
  redis: IORedis.Redis
  ratesService: RatesService
  accountService: AccountService
  streamServer: StreamServer
  ilpAddress: string
}

export async function createConnectorService({
  logger,
  redis,
  ratesService,
  accountService,
  streamServer,
  ilpAddress
}: ServiceDependencies): Promise<Rafiki> {
  const log = logger.child({
    service: 'Connector'
  })

  const incoming = compose([
    // Incoming Rules
    createIncomingErrorHandlerMiddleware(ilpAddress),
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

  const middleware = compose([incoming, createBalanceMiddleware(), outgoing])

  // TODO Add auth
  const app = createApp({
    //router: router,
    logger: log,
    accounts: accountService,
    redis,
    rates: ratesService,
    streamServer
  })

  const appRouter = new RafikiRouter()

  // Default ILP routes
  // TODO Understand the priority and workings of the router... Seems to do funky stuff. Maybe worth just writing ILP one?
  appRouter.ilpRoute('test.*', middleware)
  appRouter.ilpRoute('peer.config', createIldcpProtocolController(ilpAddress))
  //appRouter.ilpRoute('peer.route.*', createCcpProtocolController())
  // TODO Handle echo
  app.use(appRouter.routes())

  return app
}
