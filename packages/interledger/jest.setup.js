// eslint-disable-next-line @typescript-eslint/no-var-requires
const Knex = require('knex')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GenericContainer, Wait } = require('testcontainers')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tmp = require('tmp')

tmp.setGracefulCleanup()

const POSTGRES_PORT = 5432

const TIGERBEETLE_CLUSTER_ID = 1
const TIGERBEETLE_PORT = 3001
const TIGERBEETLE_DIR = '/var/lib/tigerbeetle'

const REDIS_PORT = 6379

module.exports = async () => {
  if (!process.env.POSTGRES_URL) {
    const postgresContainer = await new GenericContainer('postgres')
      .withExposedPorts(POSTGRES_PORT)
      .withBindMount(
        __dirname + '/scripts/init.sh',
        '/docker-entrypoint-initdb.d/init.sh'
      )
      .withEnv('POSTGRES_PASSWORD', 'password')
      .start()

    process.env.POSTGRES_URL = `postgresql://postgres:password@localhost:${postgresContainer.getMappedPort(
      POSTGRES_PORT
    )}/testing`

    global.__ACCOUNTS_POSTGRES__ = postgresContainer
  }

  const knex = Knex({
    client: 'postgresql',
    connection: process.env.POSTGRES_URL,
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
    directory: __dirname + '/migrations'
  })
  global.__ACCOUNTS_KNEX__ = knex

  if (!process.env.TIGERBEETLE_REPLICA_ADDRESSES) {
    const { name: tigerbeetleDir } = tmp.dirSync({ unsafeCleanup: true })

    await new GenericContainer('ghcr.io/wilsonianb/tigerbeetle:clients-max')
      .withExposedPorts(TIGERBEETLE_PORT)
      .withBindMount(tigerbeetleDir, TIGERBEETLE_DIR)
      .withCmd([
        'init',
        '--cluster=' + TIGERBEETLE_CLUSTER_ID,
        '--replica=0',
        '--directory=' + TIGERBEETLE_DIR
      ])
      .withWaitStrategy(Wait.forLogMessage(/initialized data file/))
      .start()

    const tigerbeetleContainer = await new GenericContainer(
      'ghcr.io/wilsonianb/tigerbeetle:clients-max'
    )
      .withExposedPorts(TIGERBEETLE_PORT)
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
    global.__TIGERBEETLE__ = tigerbeetleContainer
  }

  if (!process.env.REDIS) {
    const redisContainer = await new GenericContainer('redis')
      .withExposedPorts(REDIS_PORT)
      .start()

    global.__CONNECTOR_REDIS__ = redisContainer
    process.env.REDIS = `redis://localhost:${redisContainer.getMappedPort(
      REDIS_PORT
    )}`
  }
}
