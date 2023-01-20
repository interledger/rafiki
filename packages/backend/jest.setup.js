// eslint-disable-next-line @typescript-eslint/no-var-requires
const { knex } = require('knex')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GenericContainer } = require('testcontainers')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tigerbeetle = require('./dist/tests/tigerbeetle')

const POSTGRES_PORT = 5432

const TIGERBEETLE_CLUSTER_ID = 0
const TIGERBEETLE_PORT = 3004
const TIGERBEETLE_DIR = '/var/lib/tigerbeetle'
const TIGERBEETLE_CONTAINER_LOG =
  process.env.TIGERBEETLE_CONTAINER_LOG === 'true'
//TODO @jason: https://github.com/interledger/rafiki/issues/518
//TODO @jason const TIGERBEETLE_FILE = `${TIGERBEETLE_DIR}/cluster_${TIGERBEETLE_CLUSTER_ID}_replica_0.tigerbeetle`

const REDIS_PORT = 6379

module.exports = async (globalConfig) => {
  const workers = globalConfig.maxWorkers

  const setupDatabase = async () => {
    if (!process.env.DATABASE_URL) {
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
        .start()

      process.env.DATABASE_URL = `postgresql://postgres:password@localhost:${postgresContainer.getMappedPort(
        POSTGRES_PORT
      )}/testing`

      global.__BACKEND_POSTGRES__ = postgresContainer
    }

    const db = knex({
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
    db.client.driver.types.setTypeParser(
      db.client.driver.types.builtins.INT8,
      'text',
      BigInt
    )
    await db.migrate.latest({
      directory: __dirname + '/migrations'
    })

    for (let i = 1; i <= workers; i++) {
      const workerDatabaseName = `testing_${i}`

      await db.raw(`DROP DATABASE IF EXISTS ${workerDatabaseName}`)
      await db.raw(`CREATE DATABASE ${workerDatabaseName} TEMPLATE testing`)
    }

    global.__BACKEND_KNEX__ = db
  }

  const setupTigerbeetle = async () => {
    if (!process.env.TIGERBEETLE_REPLICA_ADDRESSES) {
      const tbContStart = await tigerbeetle.startTigerbeetleContainer(
        TIGERBEETLE_DIR,
        TIGERBEETLE_PORT,
        TIGERBEETLE_CLUSTER_ID,
        TIGERBEETLE_CONTAINER_LOG
      )

      process.env.TIGERBEETLE_CLUSTER_ID = TIGERBEETLE_CLUSTER_ID
      process.env.TIGERBEETLE_REPLICA_ADDRESSES = `[${tbContStart.getMappedPort(
        TIGERBEETLE_PORT
      )}]`
      global.__BACKEND_TIGERBEETLE__ = tbContStart
    }
  }

  const setupRedis = async () => {
    if (!process.env.REDIS_URL) {
      const redisContainer = await new GenericContainer('redis:7')
        .withExposedPorts(REDIS_PORT)
        .start()

      global.__BACKEND_REDIS__ = redisContainer
      process.env.REDIS_URL = `redis://localhost:${redisContainer.getMappedPort(
        REDIS_PORT
      )}`
    }
  }

  await Promise.all([setupDatabase(), setupTigerbeetle(), setupRedis()])
}
