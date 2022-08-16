// eslint-disable-next-line @typescript-eslint/no-var-requires
const Knex = require('knex')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GenericContainer, Wait } = require('testcontainers')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tmp = require('tmp')

const POSTGRES_PORT = 5432

const TIGERBEETLE_CLUSTER_ID = 1
const TIGERBEETLE_PORT = 3004
const TIGERBEETLE_DIR = '/var/lib/tigerbeetle'

const REDIS_PORT = 6379

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
    )}/testing`

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
    const workerDatabaseName = `testing_${i}`

    await knex.raw(`DROP DATABASE IF EXISTS ${workerDatabaseName}`)
    await knex.raw(`CREATE DATABASE ${workerDatabaseName} TEMPLATE testing`)
  }

  global.__BACKEND_KNEX__ = knex

  if (!process.env.TIGERBEETLE_REPLICA_ADDRESSES) {
    const { name: tigerbeetleDir } = tmp.dirSync({ unsafeCleanup: true })

    await new GenericContainer(
      'ghcr.io/coilhq/tigerbeetle@sha256:56e24aa5d64e66e95fc8b42c8cfe740f2b2b4045804c828e60af4dea8557fbc7'
    )
      .withExposedPorts(TIGERBEETLE_PORT)
      .withBindMount(tigerbeetleDir, TIGERBEETLE_DIR)
      .withPrivilegedMode()
      .withCmd([
        'init',
        '--cluster=' + TIGERBEETLE_CLUSTER_ID,
        '--replica=0',
        '--directory=' + TIGERBEETLE_DIR
      ])
      .withWaitStrategy(Wait.forLogMessage(/initialized data file/))
      .start()

    const tigerbeetleContainer = await new GenericContainer(
      'ghcr.io/coilhq/tigerbeetle@sha256:56e24aa5d64e66e95fc8b42c8cfe740f2b2b4045804c828e60af4dea8557fbc7'
    )
      .withExposedPorts(TIGERBEETLE_PORT)
      .withPrivilegedMode()
      .withBindMount(tigerbeetleDir, TIGERBEETLE_DIR)
      .withCmd([
        'start',
        '--cluster=' + TIGERBEETLE_CLUSTER_ID,
        '--replica=0',
        '--addresses=0.0.0.0:' + TIGERBEETLE_PORT,
        '--directory=' + TIGERBEETLE_DIR
      ])
      .withWaitStrategy(Wait.forLogMessage(/listening on/))
      .start()

    process.env.TIGERBEETLE_CLUSTER_ID = TIGERBEETLE_CLUSTER_ID
    process.env.TIGERBEETLE_REPLICA_ADDRESSES = `[${tigerbeetleContainer.getMappedPort(
      TIGERBEETLE_PORT
    )}]`
    global.__BACKEND_TIGERBEETLE__ = tigerbeetleContainer
  }

  if (!process.env.REDIS_URL) {
    const redisContainer = await new GenericContainer('redis')
      .withExposedPorts(REDIS_PORT)
      .start()

    global.__BACKEND_REDIS__ = redisContainer
    process.env.REDIS_URL = `redis://localhost:${redisContainer.getMappedPort(
      REDIS_PORT
    )}`
  }
}
