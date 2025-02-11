import path from 'path'
import createLogger from 'pino'
import { knex } from 'knex'
import { Model } from 'objection'
import { Ioc, IocContract } from '@adonisjs/fold'

import { App, AppServices } from './app'
import { Config } from './config/app'
import { createClientService } from './client/service'
import { createAccessService } from './access/service'
import { createGrantService } from './grant/service'
import { createAccessTokenService } from './accessToken/service'
import { createAccessTokenRoutes } from './accessToken/routes'
import { createGrantRoutes } from './grant/routes'
import { createInteractionRoutes } from './interaction/routes'
import { createOpenAPI } from '@interledger/openapi'
import { createUnauthenticatedClient as createOpenPaymentsClient } from '@interledger/open-payments'
import { createInteractionService } from './interaction/service'
import { getTokenIntrospectionOpenAPI } from 'token-introspection'
import { Redis } from 'ioredis'
import { createSubjectService } from './subject/service'
import { createTenantService } from './tenant/service'
import { createTenantRoutes } from './tenant/routes'

const container = initIocContainer(Config)
const app = new App(container)

export function initIocContainer(
  config: typeof Config
): IocContract<AppServices> {
  const container: IocContract<AppServices> = new Ioc()

  container.singleton('config', async () => config)
  container.singleton('logger', async (deps: IocContract<AppServices>) => {
    const config = await deps.use('config')
    const logger = createLogger({
      level: config.logLevel,
      redact: [
        'grant.continueToken',
        'headers.authorization',
        'accessToken.value',
        'requestBody.access_token'
      ]
    })
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
        tableName: 'auth_knex_migrations'
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
    // node pg defaults to returning bigint as string. This ensures it parses to bigint
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

  container.singleton('openPaymentsClient', async (deps) => {
    const logger = await deps.use('logger')
    return createOpenPaymentsClient({
      logger,
      useHttp: process.env.NODE_ENV === 'development'
    })
  })

  container.singleton(
    'accessService',
    async (deps: IocContract<AppServices>) => {
      return createAccessService({
        logger: await deps.use('logger'),
        knex: await deps.use('knex')
      })
    }
  )

  container.singleton(
    'subjectService',
    async (deps: IocContract<AppServices>) => {
      return createSubjectService({
        logger: await deps.use('logger'),
        knex: await deps.use('knex')
      })
    }
  )

  container.singleton(
    'clientService',
    async (deps: IocContract<AppServices>) => {
      return createClientService({
        logger: await deps.use('logger'),
        openPaymentsClient: await deps.use('openPaymentsClient')
      })
    }
  )

  container.singleton(
    'grantService',
    async (deps: IocContract<AppServices>) => {
      return createGrantService({
        config: await deps.use('config'),
        logger: await deps.use('logger'),
        accessService: await deps.use('accessService'),
        accessTokenService: await deps.use('accessTokenService'),
        subjectService: await deps.use('subjectService'),
        knex: await deps.use('knex')
      })
    }
  )

  container.singleton(
    'interactionService',
    async (deps: IocContract<AppServices>) => {
      return createInteractionService({
        logger: await deps.use('logger'),
        knex: await deps.use('knex'),
        config: await deps.use('config'),
        grantService: await deps.use('grantService')
      })
    }
  )

  container.singleton(
    'tenantService',
    async (deps: IocContract<AppServices>) => {
      return createTenantService({
        logger: await deps.use('logger'),
        knex: await deps.use('knex'),
        config: await deps.use('config')
      })
    }
  )

  container.singleton('grantRoutes', async (deps: IocContract<AppServices>) => {
    return createGrantRoutes({
      grantService: await deps.use('grantService'),
      clientService: await deps.use('clientService'),
      accessTokenService: await deps.use('accessTokenService'),
      accessService: await deps.use('accessService'),
      subjectService: await deps.use('subjectService'),
      interactionService: await deps.use('interactionService'),
      tenantService: await deps.use('tenantService'),
      logger: await deps.use('logger'),
      config: await deps.use('config')
    })
  })

  container.singleton(
    'interactionRoutes',
    async (deps: IocContract<AppServices>) => {
      return createInteractionRoutes({
        accessService: await deps.use('accessService'),
        subjectService: await deps.use('subjectService'),
        interactionService: await deps.use('interactionService'),
        grantService: await deps.use('grantService'),
        tenantService: await deps.use('tenantService'),
        logger: await deps.use('logger'),
        config: await deps.use('config')
      })
    }
  )

  container.singleton(
    'tenantRoutes',
    async (deps: IocContract<AppServices>) => {
      return createTenantRoutes({
        tenantService: await deps.use('tenantService'),
        logger: await deps.use('logger')
      })
    }
  )

  container.singleton('openApi', async () => {
    const authServerSpec = await createOpenAPI(
      path.resolve(
        __dirname,
        '../../../open-payments-specifications/openapi/auth-server.yaml'
      )
    )
    const idpSpec = await createOpenAPI(
      path.resolve(__dirname, './openapi/specs/id-provider.yaml')
    )
    const tokenIntrospectionSpec = await getTokenIntrospectionOpenAPI()

    return {
      authServerSpec,
      idpSpec,
      tokenIntrospectionSpec
    }
  })

  container.singleton(
    'accessTokenService',
    async (deps: IocContract<AppServices>) => {
      const { accessTokenExpirySeconds } = await deps.use('config')

      return await createAccessTokenService({
        logger: await deps.use('logger'),
        knex: await deps.use('knex'),
        clientService: await deps.use('clientService'),
        accessTokenExpirySeconds
      })
    }
  )

  container.singleton(
    'accessTokenRoutes',
    async (deps: IocContract<AppServices>) => {
      return createAccessTokenRoutes({
        config: await deps.use('config'),
        logger: await deps.use('logger'),
        knex: await deps.use('knex'),
        accessTokenService: await deps.use('accessTokenService'),
        clientService: await deps.use('clientService'),
        accessService: await deps.use('accessService'),
        grantService: await deps.use('grantService')
      })
    }
  )

  container.singleton('redis', async (deps): Promise<Redis> => {
    const config = await deps.use('config')
    return new Redis(config.redisUrl, { tls: config.redisTls })
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
  const redis = await container.use('redis')
  redis.disconnect()
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

  // Update Operator Tenant from config
  const tenantService = await container.use('tenantService')
  await tenantService.updateOperatorApiSecretFromConfig()

  await app.boot()

  await app.startAdminServer(config.adminPort)
  logger.info(`Admin listening on ${app.getAdminPort()}`)

  await app.startAuthServer(config.authPort)
  logger.info(`Auth server listening on ${app.getAuthPort()}`)

  await app.startInteractionServer(config.interactionPort)
  logger.info(`Interaction server listening on ${app.getInteractionPort()}`)

  await app.startIntrospectionServer(config.introspectionPort)
  logger.info(`Introspection server listening on ${app.getIntrospectionPort()}`)

  await app.startServiceAPIServer(config.serviceAPIPort)
  logger.info(`Service API server listening on ${app.getServiceAPIPort()}`)
}

// If this script is run directly, start the server
if (!module.parent) {
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
