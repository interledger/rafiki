import { randomBytes } from 'crypto'
import compose = require('koa-compose')
import IORedis from 'ioredis'
import { RatesService } from 'rates'

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

const ILP_ADDRESS = process.env.ILP_ADDRESS || undefined
const STREAM_SECRET = process.env.STREAM_SECRET
  ? Buffer.from(process.env.STREAM_SECRET, 'base64')
  : randomBytes(32)

interface ServiceDependencies {
  redis: IORedis.Redis
  logger?: typeof Logger
  ratesService: RatesService
  accountService: AccountService
}

export async function createConnectorService({
  redis,
  ratesService,
  accountService
}: ServiceDependencies): Promise<Rafiki> {
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

  const middleware = compose([incoming, createBalanceMiddleware(), outgoing])

  // TODO Add auth
  const app = createApp({
    //router: router,
    accounts: accountService,
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

  return app
}
