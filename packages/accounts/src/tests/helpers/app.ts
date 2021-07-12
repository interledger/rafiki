import createLogger from 'pino'
import Knex from 'knex'
import { IocContract } from '@adonisjs/fold'
import { Client } from 'tigerbeetle-node'
import { v4 as uuid } from 'uuid'

import { gracefulShutdown } from '../..'
import { App, AppServices } from '../../app'

export interface TestContainer {
  port: number
  app: App
  knex: Knex
  connectionUrl: string
  tigerbeetle: Client
  shutdown: () => Promise<void>
}

export const createTestApp = async (
  container: IocContract<AppServices>
): Promise<TestContainer> => {
  const config = await container.use('config')
  config.port = 0
  // config.adminPort = 0
  config.ilpAddress = 'test.rafiki'
  config.peerAddresses = [
    {
      accountId: uuid(),
      ilpAddress: 'test.alice'
    }
  ]
  const logger = createLogger({
    prettyPrint: {
      translateTime: true,
      ignore: 'pid,hostname'
    },
    level: process.env.LOG_LEVEL || 'error',
    name: 'test-logger'
  })

  container.bind('logger', async () => logger)
  const app = await App.createApp(container)
  const knex = await container.use('knex')
  const tigerbeetle = await container.use('tigerbeetle')

  return {
    app,
    port: app.getPort(),
    knex,
    connectionUrl: config.postgresUrl,
    tigerbeetle,
    shutdown: async () => {
      await gracefulShutdown(container, app)
    }
  }
}
