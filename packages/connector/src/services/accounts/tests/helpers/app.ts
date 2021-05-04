import createLogger from 'pino'
import Knex from 'knex'
import { IocContract } from '@adonisjs/fold'

import { start, gracefulShutdown } from '../../../../accounts'
import { App, AppServices } from '../../app'

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:password@localhost:5432/testing'

export interface TestContainer {
  port: number
  app: App
  knex: Knex
  connectionUrl: string
  shutdown: () => Promise<void>
}

export const createTestApp = async (
  container: IocContract<AppServices>
): Promise<TestContainer> => {
  const config = await container.use('config')
  config.databaseUrl = DATABASE_URL
  config.port = 0
  // config.adminPort = 0
  const logger = createLogger({
    prettyPrint: {
      translateTime: true,
      ignore: 'pid,hostname'
    },
    level: process.env.LOG_LEVEL || 'error',
    name: 'test-logger'
  })

  container.bind('logger', async () => logger)
  const app = await start(container)
  const knex = await container.use('knex')

  return {
    app,
    port: app.getPort(),
    knex,
    connectionUrl: DATABASE_URL,
    shutdown: async () => {
      await gracefulShutdown(container, app)
    }
  }
}
