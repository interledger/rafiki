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
import { Logger } from '../logger/service'
import { AccountService } from '../account/service'
import { RatesService } from '../rates/service'

interface ServiceDependencies {
  redis: IORedis.Redis
  logger?: typeof Logger
  ratesService: RatesService
  accountService: AccountService
  streamServer: StreamServer
  ilpAddress: string
}

export async function createConnectorService({
  redis,
  ratesService,
  accountService,
  streamServer,
  ilpAddress
}: ServiceDependencies): Promise<Rafiki> {
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
