import { Ioc, IocContract } from '@adonisjs/fold'
import { knex } from 'knex'
import { Model } from 'objection'
import { Config } from './config/app'
import { App, AppServices } from './app'
import createLogger from 'pino'
import { createMerchantService } from './merchant/service'
import { createPosDeviceService } from './merchant/devices/service'

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
        tableName: 'pos_knex_migrations'
      },
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

    // node pg defaults to returning bigint as string. This ensures it parses to bigint
    db.client.driver.types.setTypeParser(
      db.client.driver.types.builtins.INT8,
      'text',
      BigInt
    )
    return db
  })

  container.singleton('merchantService', async (deps) => {
    const [logger, knex] = await Promise.all([
      deps.use('logger'),
      deps.use('knex')
    ])
    return createMerchantService({ logger, knex })
  })

  container.singleton(
    'posDeviceService',
    async (deps: IocContract<AppServices>) => {
      const config = await deps.use('config')
      const logger = await deps.use('logger')
      const knex = await deps.use('knex')
      return await createPosDeviceService({ config, logger, knex })
    }
  )
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

  await app.startPosServer(config.port)
  logger.info(`POS Service listening on ${app.getPort()}`)
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
