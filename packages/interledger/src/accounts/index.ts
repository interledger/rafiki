import { EventEmitter } from 'events'
import createLogger from 'pino'
import Knex from 'knex'
import { Model } from 'objection'
import { Ioc, IocContract } from '@adonisjs/fold'
import { createClient } from 'tigerbeetle-node'

import { App, AppServices } from './app'
import { Config } from '../config'

const container = initIocContainer(Config)

export function initIocContainer(
  config: typeof Config
): IocContract<AppServices> {
  const container: IocContract<AppServices> = new Ioc()
  container.singleton('config', async () => config)
  container.singleton('logger', async (deps: IocContract<AppServices>) => {
    const config = await deps.use('config')
    const logger = createLogger()
    logger.level = config.logLevel
    return logger
  })
  container.singleton('knex', async (deps: IocContract<AppServices>) => {
    const logger = await deps.use('logger')
    const config = await deps.use('config')
    logger.info({ msg: 'creating knex' })
    const knex = Knex({
      client: 'postgresql',
      connection: config.postgresUrl,
      pool: {
        min: 2,
        max: 10
      },
      migrations: {
        directory: './',
        tableName: 'knex_migrations'
      }
    })
    // node pg defaults to returning bigint as string. This ensures it parses to bigint
    knex.client.driver.types.setTypeParser(
      knex.client.driver.types.builtins.INT8,
      'text',
      BigInt
    )
    return knex
  })
  container.singleton('closeEmitter', async () => new EventEmitter())
  container.singleton('tigerbeetle', async (deps: IocContract<AppServices>) => {
    const logger = await deps.use('logger')
    const config = await deps.use('config')
    logger.info({ msg: 'creating tigerbeetle client' })
    return createClient({
      cluster_id: config.tigerbeetleClusterId,
      replica_addresses: config.tigerbeetleReplicaAddresses
    })
  })

  return container
}

export const gracefulShutdown = async (
  container: IocContract<AppServices>,
  app: App
): Promise<void> => {
  const logger = await container.use('logger')
  logger.info('shutting down.')
  await app.shutdown()
  const knex = await container.use('knex')
  await knex.destroy()
  const tigerbeetle = await container.use('tigerbeetle')
  tigerbeetle.destroy()
}

export const start = async (
  container: IocContract<AppServices>
): Promise<App> => {
  let shuttingDown = false
  const logger = await container.use('logger')
  const app = await App.createApp(container)
  process.on(
    'SIGINT',
    async (): Promise<void> => {
      logger.info('received SIGINT attempting graceful shutdown')
      try {
        if (shuttingDown) {
          logger.warn(
            'received second SIGINT during graceful shutdown, exiting forcefully.'
          )
          process.exit(1)
        }

        shuttingDown = true

        // Graceful shutdown
        await gracefulShutdown(container, app)
        logger.info('completed graceful shutdown.')
        process.exit(0)
      } catch (err) {
        const errInfo =
          err && typeof err === 'object' && err.stack ? err.stack : err
        logger.error({ error: errInfo }, 'error while shutting down')
        process.exit(1)
      }
    }
  )

  process.on(
    'SIGTERM',
    async (): Promise<void> => {
      logger.info('received SIGTERM attempting graceful shutdown')

      try {
        // Graceful shutdown
        await gracefulShutdown(container, app)
        logger.info('completed graceful shutdown.')
        process.exit(0)
      } catch (err) {
        const errInfo =
          err && typeof err === 'object' && err.stack ? err.stack : err
        logger.error({ error: errInfo }, 'error while shutting down')
        process.exit(1)
      }
    }
  )

  // Do migrations
  const knex = await container.use('knex')
  await knex.migrate
    .latest({
      directory: './packages/accounts/migrations'
    })
    .catch((error): void => {
      logger.error({ error }, 'error migrating database')
    })

  Model.knex(knex)

  const config = await container.use('config')
  app.listen(config.port)
  logger.info(`Accounts service listening on ${app.getPort()}`)
  return app
}

// If this script is run directly, start the server
if (!module.parent) {
  start(container).catch(
    async (e): Promise<void> => {
      const errInfo = e && typeof e === 'object' && e.stack ? e.stack : e
      const logger = await container.use('logger')
      logger.error(errInfo)
    }
  )
}

export * from './app'
export * from '../config'
export * from './errors'
export * from './types'
