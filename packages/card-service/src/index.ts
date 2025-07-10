import { App, AppServices } from './app'
import { Config } from './config/app'
import { Ioc, IocContract } from '@adonisjs/fold'
import createLogger from 'pino'
import { knex } from 'knex'
import { Model } from 'objection'
import Redis from 'ioredis'
import { createPOSStore, PosStoreService } from './pos-store/service'
import { createPaymentService } from './payment/service'
import { createPaymentRoutes } from './payment/routes'
import { createOpenAPI } from '@interledger/openapi'
import path from 'path'

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
    const db = knex({
      client: 'postgresql',
      connection: config.databaseUrl,
      pool: {
        min: 2,
        max: 10
      },
      migrations: {
        directory: './',
        tableName: 'knex_migrations'
      },
      searchPath: config.dbSchema,
      log: {
        warn(message) {
          logger.warn(message)
        },
        error(message) {
          logger.error(message)
        },
        deprecate(message) {
          logger.warn(message)
        },
        debug(message) {
          logger.debug(message)
        }
      }
    })
    db.client.driver.types.setTypeParser(
      db.client.driver.types.builtins.INT8,
      'text',
      BigInt
    )
    if (config.dbSchema) {
      await db.raw(`CREATE SCHEMA IF NOT EXISTS "${config.dbSchema}"`)
    }
    return db
  })

  container.singleton('redis', async (deps): Promise<Redis> => {
    const config = await deps.use('config')
    return new Redis(config.redisUrl, {
      tls: config.redisTls,
      stringNumbers: true
    })
  })

  container.singleton('pos-store', async (deps): Promise<PosStoreService> => {
    const redis = await deps.use('redis')
    const logger = await deps.use('logger')
    return createPOSStore({ redis, logger })
  })

  container.singleton('openApi', async () => {
    const cardServerSpec = await createOpenAPI(
      path.resolve(__dirname, './openapi/specs/card-server.yaml')
    )

    return {
      cardServerSpec
    }
  })

  container.singleton(
    'paymentService',
    async (deps: IocContract<AppServices>) => {
      return createPaymentService({
        logger: await deps.use('logger'),
        config: await deps.use('config')
      })
    }
  )

  container.singleton(
    'paymentRoutes',
    async (deps: IocContract<AppServices>) => {
      return createPaymentRoutes({
        logger: await deps.use('logger'),
        paymentService: await deps.use('paymentService')
      })
    }
  )

  return container
}

export const start = async (
  container: IocContract<AppServices>,
  app: App
): Promise<void> => {
  let shuttingDown = false
  const logger = await container.use('logger')
  process.on('SIGINT', async (): Promise<void> => {
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
      const errInfo = err instanceof Error && err.stack ? err.stack : err
      logger.error({ err: errInfo }, 'error while shutting down')
      process.exit(1)
    }
  })

  process.on('SIGTERM', async (): Promise<void> => {
    logger.info('received SIGTERM attempting graceful shutdown')

    try {
      if (shuttingDown) {
        logger.warn(
          'received second SIGTERM during graceful shutdown, exiting forcefully.'
        )
        process.exit(1)
      }

      shuttingDown = true
      // Graceful shutdown
      await gracefulShutdown(container, app)
      logger.info('completed graceful shutdown.')
      process.exit(0)
    } catch (err) {
      const errInfo = err instanceof Error && err.stack ? err.stack : err
      logger.error({ err: errInfo }, 'error while shutting down')
      process.exit(1)
    }
  })

  const config = await container.use('config')

  // Do migrations
  const knex = await container.use('knex')

  if (!config.enableManualMigrations) {
    // Needs a wrapped inline function
    await callWithRetry(async () => {
      await knex.migrate.latest({
        directory: __dirname + '/../migrations'
      })
    })
  }

  Model.knex(knex)

  await app.boot()

  await app.startCardServiceServer(config.cardServicePort)
  logger.info(`Card service listening on ${app.getCardServicePort()}`)
}

if (require.main === module) {
  const container = initIocContainer(Config)
  const app = new App(container)

  start(container, app).catch(async (e): Promise<void> => {
    const errInfo = e && typeof e === 'object' && e.stack ? e.stack : e
    const logger = await container.use('logger')
    logger.error({ err: errInfo })
  })
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
}

// Used for running migrations in a try loop with exponential backoff
const callWithRetry: CallableFunction = async (
  fn: CallableFunction,
  depth = 0
) => {
  const wait = (ms: number) => new Promise((res) => setTimeout(res, ms))

  try {
    return await fn()
  } catch (e) {
    if (depth > 7) {
      throw e
    }
    await wait(2 ** depth * 30)

    return callWithRetry(fn, depth + 1)
  }
}
