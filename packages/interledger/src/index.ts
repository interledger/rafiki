import IORedis from 'ioredis'
import { AdminApi } from './admin-api'

import { Server } from 'http'

import createLogger from 'pino'
import { createConnectorService } from './connector'
const logger = createLogger()

const REDIS = process.env.REDIS || 'redis://127.0.0.1:6379'
const PORT = parseInt(process.env.ADMIN_API_PORT || '3000', 10)

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
  const connectorService = await createConnectorService({ redis })
  adminApi = connectorService.adminApi
  const app = connectorService.app

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
