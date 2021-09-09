import IORedis from 'ioredis'
import { Server } from 'http'
import { ApolloServer } from 'apollo-server'
import { createClient } from 'tigerbeetle-node'
import { createRatesService } from 'rates'

import { createAdminApi } from './admin-api'
import { createConnectorService } from './connector'
import { Rafiki } from './connector/core'
import { Config } from './config'
import { AccountsService } from './accounts/service'
import { createBalanceService } from './balance/service'
import { Logger } from './logger/service'

const logger = Logger

const REDIS = process.env.REDIS || 'redis://127.0.0.1:6379'
// TODO: connector port and admin api port use the same env variable?
const CONNECTOR_PORT = parseInt(process.env.ADMIN_API_PORT || '3000', 10)
// This port *must not* be accessible to users/public. It is for packet sending by the backend API service.
const CONNECTOR_ADMIN_PORT = parseInt(process.env.ADMIN_API_PORT || '3009', 10)

const ADMIN_API_HOST = process.env.ADMIN_API_HOST || '127.0.0.1'
const ADMIN_API_PORT = parseInt(process.env.ADMIN_API_PORT || '3001', 10)

const pricesUrl = process.env.PRICES_URL // optional
const pricesLifetime = +(process.env.PRICES_LIFETIME || 15_000)

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
const tbClient = createClient({
  cluster_id: Config.tigerbeetleClusterId,
  replica_addresses: Config.tigerbeetleReplicaAddresses
})

let adminApi: ApolloServer
let connectorApp: Rafiki
let connectorPublicServer: Server
let connectorAdminServer: Server

export const gracefulShutdown = async (): Promise<void> => {
  logger.info('shutting down.')
  await adminApi.stop()
  await Promise.all([
    connectorPublicServer &&
      new Promise((resolve, reject): void => {
        connectorPublicServer.close((err?: Error) => {
          if (err) return reject(err)
          else resolve(undefined)
        })
      }),
    connectorAdminServer &&
      new Promise((resolve, reject): void => {
        connectorAdminServer.close((err?: Error) => {
          if (err) return reject(err)
          else resolve(undefined)
        })
      })
  ]).then(() => redis.quit())
}

export const start = async (): Promise<void> => {
  const balanceService = createBalanceService({
    logger,
    tbClient
  })

  const accountsService = new AccountsService(balanceService, Config, logger)

  const ratesService = createRatesService({
    pricesUrl,
    pricesLifetime,
    logger
  })

  adminApi = await createAdminApi({ accountsService, logger })

  connectorApp = await createConnectorService({
    redis,
    logger,
    ratesService,
    accountsService
  })

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

  connectorPublicServer = connectorApp.listenPublic(CONNECTOR_PORT)
  connectorAdminServer = connectorApp.listenAdmin(CONNECTOR_ADMIN_PORT)
  logger.info(`Connector listening on ${CONNECTOR_PORT}`)
  await adminApi.listen({ host: ADMIN_API_HOST, port: ADMIN_API_PORT })
  logger.info('🐒 has 🚀. Get ready for 🍌🍌🍌🍌🍌')
}

// If this script is run directly, start the server
if (!module.parent) {
  start().catch((e) => {
    const errInfo = e && typeof e === 'object' && e.stack ? e.stack : e
    logger.error(errInfo)
  })
}
