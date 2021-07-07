import { randomBytes } from 'crypto'
import { Config, initIocContainer, start as startAccounts } from 'accounts'
import IORedis from 'ioredis'
import {
  createApp,
  RafikiRouter,
  createRatesService,
  createBalanceMiddleware,
  createIncomingErrorHandlerMiddleware,
  createIldcpProtocolController,
  createStreamController,
  //createCcpProtocolController,
  createOutgoingExpireMiddleware,
  createClientController,
  createIncomingMaxPacketAmountMiddleware,
  createIncomingRateLimitMiddleware,
  createIncomingThroughputMiddleware,
  createOutgoingReduceExpiryMiddleware,
  createOutgoingThroughputMiddleware,
  createOutgoingValidateFulfillmentMiddleware
} from './services/core'
import { AdminApi } from './services/admin-api'

//import { config } from 'dotenv'
import { Server } from 'http'

import createLogger from 'pino'
import compose = require('koa-compose')
//config()
const logger = createLogger()

/**
 * Admin API Variables
 */
const ADMIN_API_HOST = process.env.ADMIN_API_HOST || '127.0.0.1'
const ADMIN_API_PORT = parseInt(process.env.ADMIN_API_PORT || '3001', 10)
// const ADMIN_API_AUTH_TOKEN = process.env.ADMIN_API_AUTH_TOKEN || '' // TODO
const REDIS = process.env.REDIS || 'redis://127.0.0.1:6379'

/**
 * Connector variables
 */
//const PREFIX = process.env.PREFIX || 'test'
const ILP_ADDRESS = process.env.ILP_ADDRESS || undefined
const PORT = parseInt(process.env.ADMIN_API_PORT || '3000', 10)
const STREAM_SECRET = process.env.STREAM_SECRET
  ? Buffer.from(process.env.STREAM_SECRET, 'base64')
  : randomBytes(32)
const pricesUrl = process.env.PRICES_URL // optional
const pricesLifetime = +(process.env.PRICES_LIFETIME || 15_000)

if (!ILP_ADDRESS) {
  throw new Error('ILP_ADDRESS is required')
}

/*
const router = new InMemoryRouter(peerService, {
  globalPrefix: PREFIX,
  ilpAddress: ILP_ADDRESS
})
*/
const redis = new IORedis(REDIS, {
  // This option messes up some types, but helps with (large) number accuracy.
  stringNumbers: true
})

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

const ratesService = createRatesService({ pricesUrl, pricesLifetime, logger })
const middleware = compose([incoming, createBalanceMiddleware(), outgoing])

let adminApi: AdminApi
let server: Server

export const gracefulShutdown = async (): Promise<void> => {
  logger.info('shutting down.')
  adminApi.shutdown()
  if (server) {
    return new Promise((resolve, reject): void => {
      server.close((err?: Error) => {
        if (err) return reject(err)
        redis
          .quit()
          .then(() => resolve())
          .catch(reject)
      })
    })
  }
}
export const start = async (): Promise<void> => {
  const container = initIocContainer(Config)
  const accountsApp = await startAccounts(container)
  adminApi = new AdminApi(
    { host: ADMIN_API_HOST, port: ADMIN_API_PORT },
    {
      auth: (): boolean => {
        return true
      },
      accounts: accountsApp.getAccounts()
      //router: router
    }
  )
  // TODO Add auth
  const app = createApp({
    //router: router,
    accounts: accountsApp.getAccounts(),
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

  let shuttingDown = false
  process.on(
    'SIGINT',
    async (): Promise<void> => {
      try {
        if (shuttingDown) {
          logger.warn(
            'received second SIGINT during graceful shutdown, exiting forcefully.'
          )
          process.exit(1)
          return
        }

        shuttingDown = true

        // Graceful shutdown
        await gracefulShutdown()
        logger.info('completed graceful shutdown.')
      } catch (err) {
        const errInfo =
          err && typeof err === 'object' && err.stack ? err.stack : err
        logger.error('error while shutting down. error=%s', errInfo)
        process.exit(1)
      }
    }
  )

  server = app.listen(PORT)
  logger.info(`Connector listening on ${PORT}`)
  adminApi.listen()
  logger.info('🐒 has 🚀. Get ready for 🍌🍌🍌🍌🍌')
}

// If this script is run directly, start the server
if (!module.parent) {
  start().catch((e) => {
    const errInfo = e && typeof e === 'object' && e.stack ? e.stack : e
    logger.error(errInfo)
  })
}
