import { Knex } from 'knex'
import { IocContract } from '@adonisjs/fold'

import { start, gracefulShutdown } from '..'
import { App, AppServices } from '../app'

export interface TestContainer {
  app: App
  knex: Knex
  connectionUrl: string
  shutdown: () => Promise<void>
  container: IocContract<AppServices>
}

export const createTestApp = async (
  container: IocContract<AppServices>
): Promise<TestContainer> => {
  const config = await container.use('config')

  const testConfig = {
    ...config,
    port: 0 // dynamic port assignment
  }
  container.singleton('config', async () => testConfig)

  const app = new App(container)
  await start(container, app)

  const nock = (global as unknown as { nock: typeof import('nock') }).nock

  const knex = await container.use('knex')

  return {
    app,
    knex,
    connectionUrl: config.databaseUrl,
    shutdown: async () => {
      nock.cleanAll()
      nock.abortPendingRequests()
      nock.restore()
      nock.activate()

      await gracefulShutdown(container, app)
    },
    container
  }
}
