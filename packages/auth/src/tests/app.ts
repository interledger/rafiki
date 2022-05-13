import Knex from 'knex'
import { IocContract } from '@adonisjs/fold'
import createLogger from 'pino'

import { start, gracefulShutdown } from '..'
import { App, AppServices } from '../app'

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
  config.port = 0

  const logger = createLogger({
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: true,
        ignore: 'pid,hostname'
      }
    },
    level: process.env.LOG_LEVEL || 'error',
    name: 'test-logger'
  })

  container.bind('logger', async () => logger)

  const app = new App(container)
  await start(container, app)

  const knex = await container.use('knex')

  return {
    app,
    port: app.getPort(),
    knex,
    connectionUrl: config.databaseUrl,
    shutdown: async () => {
      await gracefulShutdown(container, app)
    }
  }
}
