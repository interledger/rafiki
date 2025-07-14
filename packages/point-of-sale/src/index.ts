import { Ioc, IocContract } from '@adonisjs/fold'
import { knex } from 'knex'
import { Model } from 'objection'
import { Config } from './config/app'
import { App, AppServices } from './app'
import createLogger from 'pino'
import {
  ApolloClient,
  ApolloLink,
  createHttpLink,
  InMemoryCache
} from '@apollo/client'
import { onError } from '@apollo/client/link/error'
import { setContext } from '@apollo/client/link/context'
import { print } from 'graphql'
import { canonicalize } from 'json-canonicalize'
import { createHmac } from 'crypto'
import { createMerchantService } from './merchant/service'
import { createPosDeviceService } from './merchant/devices/service'
import { createMerchantRoutes } from './merchant/routes'
import { createPaymentService } from './payments/service'
import { createPosDeviceRoutes } from './merchant/devices/routes'

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
    const [logger, knex, posDeviceService] = await Promise.all([
      deps.use('logger'),
      deps.use('knex'),
      deps.use('posDeviceService')
    ])
    return createMerchantService({ logger, knex, posDeviceService })
  })

  container.singleton('merchantRoutes', async (deps) => {
    return createMerchantRoutes({
      logger: await deps.use('logger'),
      merchantService: await deps.use('merchantService')
    })
  })

  container.singleton('apolloClient', async (deps) => {
    const [logger, config] = await Promise.all([
      deps.use('logger'),
      deps.use('config')
    ])

    const httpLink = createHttpLink({
      uri: config.graphqlUrl
    })

    const errorLink = onError(({ graphQLErrors }) => {
      if (graphQLErrors) {
        logger.error(graphQLErrors)
        graphQLErrors.map(({ extensions }) => {
          if (extensions && extensions.code === 'UNAUTHENTICATED') {
            logger.error('UNAUTHENTICATED')
          }

          if (extensions && extensions.code === 'FORBIDDEN') {
            logger.error('FORBIDDEN')
          }
        })
      }
    })

    const authLink = setContext((request, { headers }) => {
      if (!config.tenantSecret || !config.tenantSignatureVersion)
        return { headers }
      const timestamp = Date.now()
      const version = config.tenantSignatureVersion

      const { query, variables, operationName } = request
      const formattedRequest = {
        variables,
        operationName,
        query: print(query)
      }

      const payload = `${timestamp}.${canonicalize(formattedRequest)}`
      const hmac = createHmac('sha256', config.tenantSecret)
      hmac.update(payload)
      const digest = hmac.digest('hex')

      const link = {
        headers: {
          ...headers,
          'tenant-id': `${config.tenantId}`,
          signature: `t=${timestamp}, v${version}=${digest}`
        }
      }

      return link
    })

    const link = ApolloLink.from([errorLink, authLink, httpLink])

    const client = new ApolloClient({
      cache: new InMemoryCache({}),
      link: link,
      defaultOptions: {
        query: {
          fetchPolicy: 'no-cache'
        },
        mutate: {
          fetchPolicy: 'no-cache'
        },
        watchQuery: {
          fetchPolicy: 'no-cache'
        }
      }
    })

    return client
  })

  container.singleton('paymentClient', async (deps) => {
    return createPaymentService({
      apolloClient: await deps.use('apolloClient'),
      logger: await deps.use('logger'),
      config: await deps.use('config')
    })
  })

  container.singleton(
    'posDeviceService',
    async (deps: IocContract<AppServices>) => {
      const logger = await deps.use('logger')
      const knex = await deps.use('knex')
      return await createPosDeviceService({
        logger,
        knex
      })
    }
  )

  container.singleton('posDeviceRoutes', async (deps) =>
    createPosDeviceRoutes({
      logger: await deps.use('logger'),
      posDeviceService: await deps.use('posDeviceService')
    })
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
