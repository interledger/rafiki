// eslint-disable-next-line @typescript-eslint/no-var-requires
const Knex = require('knex')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GenericContainer } = require('testcontainers')

const POSTGRES_PORT = 5432

module.exports = async (globalConfig) => {
  const workers = globalConfig.maxWorkers

  if (!process.env.DATABASE_URL) {
    const postgresContainer = await new GenericContainer('postgres')
      .withExposedPorts(POSTGRES_PORT)
      .withBindMount(
        __dirname + '/scripts/init.sh',
        '/docker-entrypoint-initdb.d/init.sh'
      )
      .withEnv('POSTGRES_PASSWORD', 'password')
      .start()

    process.env.DATABASE_URL = `postgresql://postgres:password@localhost:${postgresContainer.getMappedPort(
      POSTGRES_PORT
    )}/auth_testing`

    global.__BACKEND_POSTGRES__ = postgresContainer
  }

  const knex = Knex({
    client: 'postgresql',
    connection: process.env.DATABASE_URL,
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'knex_migrations'
    }
  })

  // node pg defaults to returning bigint as string. This ensures it parses to bigint
  knex.client.driver.types.setTypeParser(
    knex.client.driver.types.builtins.INT8,
    'text',
    BigInt
  )
  await knex.migrate.latest({
    directory: './packages/backend/migrations'
  })

  for (let i = 1; i <= workers; i++) {
    const workerDatabaseName = `auth_testing_${i}`

    await knex.raw(`DROP DATABASE IF EXISTS ${workerDatabaseName}`)
    await knex.raw(
      `CREATE DATABASE ${workerDatabaseName} TEMPLATE auth_testing`
    )
  }

  global.__BACKEND_KNEX__ = knex
}
