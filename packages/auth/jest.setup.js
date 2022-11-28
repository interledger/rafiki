// eslint-disable-next-line @typescript-eslint/no-var-requires
const { knex } = require('knex')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GenericContainer } = require('testcontainers')

const POSTGRES_PORT = 5432

module.exports = async (globalConfig) => {
  const workers = globalConfig.maxWorkers

  if (!process.env.AUTH_DATABASE_URL) {
    const postgresContainer = await new GenericContainer('postgres:15')
      .withExposedPorts(POSTGRES_PORT)
      .withBindMount(
        __dirname + '/scripts/init.sh',
        '/docker-entrypoint-initdb.d/init.sh'
      )
      .withEnv('POSTGRES_PASSWORD', 'password')
      .start()

    process.env.AUTH_DATABASE_URL = `postgresql://postgres:password@localhost:${postgresContainer.getMappedPort(
      POSTGRES_PORT
    )}/auth_testing`

    global.__AUTH_POSTGRES__ = postgresContainer
  }

  const db = knex({
    client: 'postgresql',
    connection: process.env.AUTH_DATABASE_URL,
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'auth_knex_migrations'
    }
  })

  // node pg defaults to returning bigint as string. This ensures it parses to bigint
  db.client.driver.types.setTypeParser(
    db.client.driver.types.builtins.INT8,
    'text',
    BigInt
  )
  await db.migrate.latest({
    directory: __dirname + '/migrations'
  })

  for (let i = 1; i <= workers; i++) {
    const workerDatabaseName = `auth_testing_${i}`

    await db.raw(`DROP DATABASE IF EXISTS ${workerDatabaseName}`)
    await db.raw(`CREATE DATABASE ${workerDatabaseName} TEMPLATE auth_testing`)
  }

  global.__AUTH_KNEX__ = db
}
