import { run, RunnerOptions } from 'graphile-worker'
import { Runner } from 'graphile-worker/dist'
import Knex from 'knex'
import { Model } from 'objection'

import { Config } from './config/app'
import { initIocContainer } from '.'
import { AppContainer } from './app'

const DATABASE_URL = Config.databaseUrl

const container = initIocContainer(Config)

export const getRunnerOptions = async (
  container: AppContainer
): Promise<RunnerOptions> => {
  const config = await container.use('config')
  return {
    connectionString: config.databaseUrl,
    concurrency: 5,
    // Install signal handlers for graceful shutdown on SIGINT, SIGTERM, etc
    noHandleSignals: false,
    pollInterval: 1000,
    taskList: {}
  }
}

export async function createWorker(): Promise<Runner> {
  const runnerOptions = await getRunnerOptions(container)
  return run(runnerOptions)
}

// Run if being called directly
if (require.main === module) {
  const knex = Knex({
    client: 'postgresql',
    connection: DATABASE_URL,
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'knex_migrations'
    }
  })
  // node pg defaults to returning bigint as string. This ensures it parses to bigint
  knex.client.driver.types.setTypeParser(20, 'text', BigInt)

  Model.knex(knex)
  createWorker().catch((err): void => {
    console.error(err)
    process.exit(1)
  })
}
