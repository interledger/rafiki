import IORedis from 'ioredis'
import { Server } from 'http'
import { ApolloServer } from 'apollo-server'
import { createClient } from 'tigerbeetle-node'

import { createAdminApi } from './admin-api'
import { createConnectorService } from './connector'
import { createRatesService, Rafiki } from './connector/core'
import { Config } from './config'
import { AccountsService } from './accounts/service'
import { Logger } from './logger/service'

const logger = Logger

const REDIS = process.env.REDIS || 'redis://127.0.0.1:6379'
const PORT = parseInt(process.env.ADMIN_API_PORT || '3000', 10)

const ADMIN_API_HOST = process.env.ADMIN_API_HOST || '127.0.0.1'
const ADMIN_API_PORT = parseInt(process.env.ADMIN_API_PORT || '3001', 10)

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

let adminApi: ApolloServer
let connectorServer: Server

export const gracefulShutdown = async (): Promise<void> => {
  logger.info('shutting down.')
  await adminApi.stop()
  if (connectorServer) {
    return new Promise((resolve, reject): void => {
      connectorServer.close((err?: Error) => {
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
  adminApi = await _setupAdminApi()
  const app = await _setupConnector()

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

  connectorServer = app.listen(PORT)
  logger.info(`Connector listening on ${PORT}`)
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

async function _setupConnector(): Promise<Rafiki> {
  const tbClient = createClient({
    cluster_id: Config.tigerbeetleClusterId,
    replica_addresses: Config.tigerbeetleReplicaAddresses
  })
  const accountsService = new AccountsService(tbClient, Config, logger)

  const pricesUrl = process.env.PRICES_URL // optional
  const pricesLifetime = +(process.env.PRICES_LIFETIME || 15_000)
  const ratesService = createRatesService({
    pricesUrl,
    pricesLifetime,
    logger: logger
  })

  return createConnectorService({
    redis,
    logger,
    ratesService,
    accountsService
  })
}

async function _setupAdminApi(): Promise<ApolloServer> {
  const tbClient = createClient({
    cluster_id: Config.tigerbeetleClusterId,
    replica_addresses: Config.tigerbeetleReplicaAddresses
  })
  const accountsService = new AccountsService(tbClient, Config, logger)

  return createAdminApi({ accountsService })
}
