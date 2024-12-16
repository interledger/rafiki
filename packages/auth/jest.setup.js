// eslint-disable-next-line @typescript-eslint/no-var-requires
const { knex } = require('knex')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GenericContainer, Wait } = require('testcontainers')
require('./jest.env') // set environment variables

const POSTGRES_PORT = 5432
const REDIS_PORT = 6379

module.exports = async (globalConfig) => {
  const workers = globalConfig.maxWorkers

  if (!process.env.AUTH_DATABASE_URL) {
    const postgresContainer = await new GenericContainer('postgres:15')
      .withExposedPorts(POSTGRES_PORT)
      .withBindMounts([
        {
          source: __dirname + '/scripts/init.sh',
          target: '/docker-entrypoint-initdb.d/init.sh'
        }
      ])
      .withEnvironment({
        POSTGRES_PASSWORD: 'password'
      })
      .withHealthCheck({
        test: ['CMD-SHELL', 'pg_isready -d testing'],
        interval: 10000,
        timeout: 5000,
        retries: 5
      })
      .withWaitStrategy(Wait.forHealthCheck())
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
  if (!process.env.REDIS_URL) {
    const redisContainer = await new GenericContainer('redis:7')
      .withExposedPorts(REDIS_PORT)
      .start()

    global.__AUTH_REDIS__ = redisContainer
    process.env.REDIS_URL = `redis://localhost:${redisContainer.getMappedPort(REDIS_PORT)}`
  }
}
