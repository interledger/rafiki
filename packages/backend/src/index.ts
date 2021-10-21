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
import { createOutgoingPaymentService } from './outgoing_payment/service'
import { createIlpPlugin, IlpPlugin } from './outgoing_payment/ilp_plugin'
import { createHttpTokenService } from './httpToken/service'
import { createBalanceService } from './balance/service'
import { createAssetService } from './asset/service'
import { createAccountService } from './account/service'
import { createDepositService } from './deposit/service'
import { createWithdrawalService } from './withdrawal/service'
import { createCreditService } from './credit/service'
import { createSPSPService } from './spsp/service'
import { createTransferService } from './transfer/service'
import { createInvoiceService } from './invoice/service'
import { StreamServer } from '@interledger/stream-receiver'
import { createWebMonetizationService } from './webmonetization/service'
import { createConnectorService } from './connector'
import { createSessionKeyService } from './sessionKey/service'

BigInt.prototype.toJSON = function () {
  return this.toString()
}

const container = initIocContainer(Config)
const app = new App(container)
let connectorServer: Server
let connectorAdminServer: Server

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
  container.singleton('redis', async (deps) => {
    const config = await deps.use('config')
    return new IORedis(config.redisUrl)
  })
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
  container.singleton('balanceService', async (deps) => {
    const logger = await deps.use('logger')
    const tigerbeetle = await deps.use('tigerbeetle')
    return await createBalanceService({
      logger: logger,
      tigerbeetle: tigerbeetle
    })
  })
  container.singleton('transferService', async (deps) => {
    const logger = await deps.use('logger')
    const tigerbeetle = await deps.use('tigerbeetle')
    return await createTransferService({
      logger: logger,
      tigerbeetle: tigerbeetle
    })
  })
  container.singleton('assetService', async (deps) => {
    const logger = await deps.use('logger')
    const knex = await deps.use('knex')
    const balanceService = await deps.use('balanceService')
    return await createAssetService({
      logger: logger,
      knex: knex,
      balanceService: balanceService
    })
  })
  container.singleton('accountService', async (deps) => {
    const config = await deps.use('config')
    const logger = await deps.use('logger')
    const knex = await deps.use('knex')
    const assetService = await deps.use('assetService')
    const balanceService = await deps.use('balanceService')
    const transferService = await deps.use('transferService')
    const httpTokenService = await deps.use('httpTokenService')
    return await createAccountService({
      logger: logger,
      knex: knex,
      assetService,
      balanceService,
      httpTokenService,
      transferService,
      ilpAddress: config.ilpAddress,
      peerAddresses: config.peerAddresses
    })
  })
  container.singleton('depositService', async (deps) => {
    const logger = await deps.use('logger')
    const assetService = await deps.use('assetService')
    const accountService = await deps.use('accountService')
    const transferService = await deps.use('transferService')
    return await createDepositService({
      logger: logger,
      assetService,
      accountService,
      transferService
    })
  })
  container.singleton('withdrawalService', async (deps) => {
    const logger = await deps.use('logger')
    const assetService = await deps.use('assetService')
    const accountService = await deps.use('accountService')
    const transferService = await deps.use('transferService')
    return await createWithdrawalService({
      logger: logger,
      assetService,
      accountService,
      transferService
    })
  })
  container.singleton('creditService', async (deps) => {
    const logger = await deps.use('logger')
    const accountService = await deps.use('accountService')
    const transferService = await deps.use('transferService')
    return await createCreditService({
      logger: logger,
      accountService,
      transferService
    })
  })
  container.singleton('SPSPService', async (deps) => {
    const logger = await deps.use('logger')
    const streamServer = await deps.use('streamServer')
    const accountService = await deps.use('accountService')
    const wmService = await deps.use('wmService')
    return await createSPSPService({
      logger: logger,
      accountService: accountService,
      wmService,
      streamServer: streamServer
    })
  })
  container.singleton('invoiceService', async (deps) => {
    const logger = await deps.use('logger')
    const knex = await deps.use('knex')
    const accountService = await deps.use('accountService')
    return await createInvoiceService({
      logger: logger,
      knex: knex,
      accountService: accountService
    })
  })

  container.singleton('wmService', async (deps) => {
    const logger = await deps.use('logger')
    const knex = await deps.use('knex')
    const invoiceService = await deps.use('invoiceService')
    const accountService = await deps.use('accountService')
    return createWebMonetizationService({
      logger: logger,
      knex: knex,
      invoiceService,
      accountService
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
    const { ilpUrl } = await deps.use('config')
    return (sourceAccountId: string): IlpPlugin => {
      return createIlpPlugin(ilpUrl, `Bearer ${sourceAccountId}`)
    }
  })

  container.singleton('outgoingPaymentService', async (deps) => {
    const config = await deps.use('config')
    return await createOutgoingPaymentService({
      slippage: config.slippage,
      quoteLifespan: config.quoteLifespan,
      logger: await deps.use('logger'),
      knex: await deps.use('knex'),
      accountService: await deps.use('accountService'),
      creditService: await deps.use('creditService'),
      makeIlpPlugin: await deps.use('makeIlpPlugin'),
      ratesService: await deps.use('ratesService')
    })
  })

  container.singleton('sessionKeyService', async (deps) => {
    const logger = await deps.use('logger')
    const redis = await deps.use('redis')
    return await createSessionKeyService({ logger: logger, redis: redis })
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
  if (connectorAdminServer) {
    await new Promise((resolve, reject) => {
      connectorAdminServer.close((err?: Error) =>
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

  const connectorApp = await createConnectorService({
    logger: logger,
    redis: await container.use('redis'),
    accountService: await container.use('accountService'),
    ratesService: await container.use('ratesService'),
    streamServer: await container.use('streamServer'),
    ilpAddress: config.ilpAddress
  })
  connectorServer = connectorApp.listenPublic(config.connectorPort)
  logger.info(`Connector listening on ${config.connectorPort}`)
  connectorAdminServer = connectorApp.listenAdmin(config.connectorAdminPort)
  logger.info(`Connector listening on ${config.connectorAdminPort}`)
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
