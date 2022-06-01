import { EventEmitter } from 'events'
import { Server } from 'http'
import createLogger from 'pino'
import Knex from 'knex'
import { Model } from 'objection'
import { makeWorkerUtils } from 'graphile-worker'
import { Ioc, IocContract } from '@adonisjs/fold'
import IORedis from 'ioredis'
import { createClient } from 'tigerbeetle-node'

import { App, AppServices } from './app'
import { Config } from './config/app'
import { GraphileProducer } from './messaging/graphileProducer'
import { createRatesService } from './rates/service'
import { createQuoteRoutes } from './open_payments/quote/routes'
import { createQuoteService } from './open_payments/quote/service'
import { createOutgoingPaymentRoutes } from './open_payments/payment/outgoing/routes'
import { createOutgoingPaymentService } from './open_payments/payment/outgoing/service'
import {
  createIlpPlugin,
  IlpPlugin,
  IlpPluginOptions
} from './shared/ilp_plugin'
import { createHttpTokenService } from './httpToken/service'
import { createAssetService } from './asset/service'
import { createAccountingService } from './accounting/service'
import { createPeerService } from './peer/service'
import { createAccountService } from './open_payments/account/service'
import { createSPSPRoutes } from './spsp/routes'
import { createAccountRoutes } from './open_payments/account/routes'
import { createIncomingPaymentRoutes } from './open_payments/payment/incoming/routes'
import { createIncomingPaymentService } from './open_payments/payment/incoming/service'
import { StreamServer } from '@interledger/stream-receiver'
import { createWebhookService } from './webhook/service'
import { createConnectorService } from './connector'
import { createSessionService } from './session/service'
import { createApiKeyService } from './apiKey/service'

BigInt.prototype.toJSON = function () {
  return this.toString()
}

const container = initIocContainer(Config)
const app = new App(container)
let connectorServer: Server

export function initIocContainer(
  config: typeof Config
): IocContract<AppServices> {
  const container: IocContract<AppServices> = new Ioc()
  container.singleton('config', async () => config)
  container.singleton('workerUtils', async (deps: IocContract<AppServices>) => {
    const config = await deps.use('config')
    const logger = await deps.use('logger')
    logger.info({ msg: 'creating graphile worker utils' })
    const workerUtils = await makeWorkerUtils({
      connectionString: config.databaseUrl
    })
    await workerUtils.migrate()
    return workerUtils
  })
  container.singleton('logger', async (deps: IocContract<AppServices>) => {
    const config = await deps.use('config')
    const logger = createLogger()
    logger.level = config.logLevel
    return logger
  })
  container.singleton(
    'messageProducer',
    async (deps: IocContract<AppServices>) => {
      const logger = await deps.use('logger')
      const workerUtils = await deps.use('workerUtils')
      logger.info({ msg: 'creating graphile producer' })
      return new GraphileProducer(workerUtils)
    }
  )
  container.singleton('knex', async (deps: IocContract<AppServices>) => {
    const logger = await deps.use('logger')
    const config = await deps.use('config')
    logger.info({ msg: 'creating knex' })
    const knex = Knex({
      client: 'postgresql',
      connection: config.databaseUrl,
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
  container.singleton(
    'redis',
    async (deps): Promise<IORedis.Redis> => {
      const config = await deps.use('config')
      return new IORedis(config.redisUrl, { tls: config.redisTls })
    }
  )
  container.singleton('streamServer', async (deps) => {
    const config = await deps.use('config')
    return new StreamServer({
      serverSecret: config.streamSecret,
      serverAddress: config.ilpAddress
    })
  })
  container.singleton('tigerbeetle', async (deps) => {
    const config = await deps.use('config')
    return createClient({
      cluster_id: config.tigerbeetleClusterId,
      replica_addresses: config.tigerbeetleReplicaAddresses
    })
  })

  /**
   * Add services to the container.
   */
  container.singleton('httpTokenService', async (deps) => {
    const logger = await deps.use('logger')
    const knex = await deps.use('knex')
    return await createHttpTokenService({
      logger: logger,
      knex: knex
    })
  })
  container.singleton('assetService', async (deps) => {
    const logger = await deps.use('logger')
    const knex = await deps.use('knex')
    return await createAssetService({
      logger: logger,
      knex: knex,
      accountingService: await deps.use('accountingService')
    })
  })
  container.singleton('accountingService', async (deps) => {
    const logger = await deps.use('logger')
    const knex = await deps.use('knex')
    const tigerbeetle = await deps.use('tigerbeetle')
    return await createAccountingService({
      logger: logger,
      knex: knex,
      tigerbeetle,
      withdrawalThrottleDelay: config.withdrawalThrottleDelay
    })
  })
  container.singleton('peerService', async (deps) => {
    return await createPeerService({
      knex: await deps.use('knex'),
      logger: await deps.use('logger'),
      accountingService: await deps.use('accountingService'),
      assetService: await deps.use('assetService'),
      httpTokenService: await deps.use('httpTokenService')
    })
  })
  container.singleton('accountService', async (deps) => {
    const logger = await deps.use('logger')
    const assetService = await deps.use('assetService')
    return await createAccountService({
      knex: await deps.use('knex'),
      logger: logger,
      accountingService: await deps.use('accountingService'),
      assetService: assetService
    })
  })
  container.singleton('spspRoutes', async (deps) => {
    const logger = await deps.use('logger')
    const streamServer = await deps.use('streamServer')
    const accountService = await deps.use('accountService')
    return await createSPSPRoutes({
      logger: logger,
      accountService: accountService,
      streamServer: streamServer
    })
  })
  container.singleton('webhookService', async (deps) => {
    return createWebhookService({
      config: await deps.use('config'),
      knex: await deps.use('knex'),
      logger: await deps.use('logger')
    })
  })
  container.singleton('incomingPaymentService', async (deps) => {
    return await createIncomingPaymentService({
      logger: await deps.use('logger'),
      knex: await deps.use('knex'),
      accountingService: await deps.use('accountingService'),
      accountService: await deps.use('accountService')
    })
  })
  container.singleton('incomingPaymentRoutes', async (deps) => {
    return createIncomingPaymentRoutes({
      config: await deps.use('config'),
      logger: await deps.use('logger'),
      incomingPaymentService: await deps.use('incomingPaymentService'),
      streamServer: await deps.use('streamServer')
    })
  })
  container.singleton('accountRoutes', async (deps) => {
    return createAccountRoutes({
      config: await deps.use('config'),
      accountService: await deps.use('accountService')
    })
  })

  container.singleton('ratesService', async (deps) => {
    const config = await deps.use('config')
    return createRatesService({
      logger: await deps.use('logger'),
      pricesUrl: config.pricesUrl,
      pricesLifetime: config.pricesLifetime
    })
  })

  container.singleton('makeIlpPlugin', async (deps) => {
    const connectorApp = await deps.use('connectorApp')
    return ({
      sourceAccount,
      unfulfillable = false
    }: IlpPluginOptions): IlpPlugin => {
      return createIlpPlugin(
        (data: Buffer): Promise<Buffer> => {
          return connectorApp.handleIlpData(sourceAccount, unfulfillable, data)
        }
      )
    }
  })

  container.singleton('quoteService', async (deps) => {
    const config = await deps.use('config')
    return await createQuoteService({
      slippage: config.slippage,
      quoteLifespan: config.quoteLifespan,
      quoteUrl: config.quoteUrl,
      signatureSecret: config.signatureSecret,
      signatureVersion: config.signatureVersion,
      logger: await deps.use('logger'),
      knex: await deps.use('knex'),
      makeIlpPlugin: await deps.use('makeIlpPlugin'),
      accountService: await deps.use('accountService'),
      ratesService: await deps.use('ratesService')
    })
  })
  container.singleton('quoteRoutes', async (deps) => {
    return createQuoteRoutes({
      config: await deps.use('config'),
      logger: await deps.use('logger'),
      quoteService: await deps.use('quoteService')
    })
  })
  container.singleton('outgoingPaymentService', async (deps) => {
    return await createOutgoingPaymentService({
      logger: await deps.use('logger'),
      knex: await deps.use('knex'),
      accountingService: await deps.use('accountingService'),
      makeIlpPlugin: await deps.use('makeIlpPlugin'),
      accountService: await deps.use('accountService'),
      peerService: await deps.use('peerService')
    })
  })
  container.singleton('outgoingPaymentRoutes', async (deps) => {
    return createOutgoingPaymentRoutes({
      config: await deps.use('config'),
      logger: await deps.use('logger'),
      outgoingPaymentService: await deps.use('outgoingPaymentService')
    })
  })

  container.singleton('sessionService', async (deps) => {
    const logger = await deps.use('logger')
    const redis = await deps.use('redis')
    return await createSessionService({
      logger: logger,
      redis: redis,
      sessionLength: config.sessionLength
    })
  })

  container.singleton('apiKeyService', async (deps) => {
    const logger = await deps.use('logger')
    const knex = await deps.use('knex')
    const sessionService = await deps.use('sessionService')
    return await createApiKeyService({
      logger: logger,
      knex: knex,
      sessionService: sessionService
    })
  })

  container.singleton('connectorApp', async (deps) => {
    const config = await deps.use('config')
    return await createConnectorService({
      logger: await deps.use('logger'),
      redis: await deps.use('redis'),
      accountingService: await deps.use('accountingService'),
      accountService: await deps.use('accountService'),
      incomingPaymentService: await deps.use('incomingPaymentService'),
      peerService: await deps.use('peerService'),
      ratesService: await deps.use('ratesService'),
      streamServer: await deps.use('streamServer'),
      ilpAddress: config.ilpAddress
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
  if (connectorServer) {
    await new Promise((resolve, reject) => {
      connectorServer.close((err?: Error) =>
        err ? reject(err) : resolve(null)
      )
    })
  }
  const knex = await container.use('knex')
  await knex.destroy()
  const workerUtils = await container.use('workerUtils')
  await workerUtils.release()
  const tigerbeetle = await container.use('tigerbeetle')
  await tigerbeetle.destroy()
  const redis = await container.use('redis')
  await redis.disconnect()
}

export const start = async (
  container: IocContract<AppServices>,
  app: App
): Promise<void> => {
  let shuttingDown = false
  const logger = await container.use('logger')
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
      directory: './packages/backend/migrations'
    })
    .catch((error): void => {
      logger.error({ error: error.message }, 'error migrating database')
    })

  Model.knex(knex)

  const config = await container.use('config')
  await app.boot()
  app.listen(config.port)
  logger.info(`Listening on ${app.getPort()}`)

  const connectorApp = await container.use('connectorApp')
  connectorServer = connectorApp.listenPublic(config.connectorPort)
  logger.info(`Connector listening on ${config.connectorPort}`)
  logger.info('🐒 has 🚀. Get ready for 🍌🍌🍌🍌🍌')
}

// If this script is run directly, start the server
if (!module.parent) {
  start(container, app).catch(
    async (e): Promise<void> => {
      const errInfo = e && typeof e === 'object' && e.stack ? e.stack : e
      const logger = await container.use('logger')
      logger.error(errInfo)
    }
  )
}
