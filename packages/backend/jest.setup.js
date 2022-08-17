// eslint-disable-next-line @typescript-eslint/no-var-requires
const Knex = require('knex')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GenericContainer, Wait } = require('testcontainers')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tmp = require('tmp')

const POSTGRES_PORT = 5432

const TIGERBEETLE_CLUSTER_ID = 0
const TIGERBEETLE_PORT = 3004
const TIGERBEETLE_DIR = '/var/lib/tigerbeetle'
const TIGERBEETLE_FILE = `${TIGERBEETLE_DIR}/cluster_${TIGERBEETLE_CLUSTER_ID}_replica_0.tigerbeetle`

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

    const tbContFormat = await new GenericContainer(
      //'ghcr.io/coilhq/tigerbeetle@sha256:6b1ab1b0355ef254f22fe68a23b92c9559828061190218c7203a8f65d04e395b',//main-0.10.0
      'ghcr.io/coilhq/tigerbeetle:debug-build-no-rel-safe@sha256:0ebd904a64c2c286fddcfc0f6ba115b1c81f8449316520861a42fa3f66923e7f' //Debug-0.10.0
    )
      .withExposedPorts(TIGERBEETLE_PORT)
      .withBindMount(tigerbeetleDir, TIGERBEETLE_DIR)
      .withPrivilegedMode()
      .withCmd([
        'format',
        `--cluster=${TIGERBEETLE_CLUSTER_ID}`,
        '--replica=0',
        TIGERBEETLE_FILE
      ])
      .withWaitStrategy(Wait.forLogMessage(/allocating/)) //TODO @jason need to add more criteria
      .start()

    // Give TB a chance to startup (no message currently to notify allocation is complete):
    await new Promise((f) => setTimeout(f, 2000))

    const streamTbFormat = await tbContFormat.logs()
    streamTbFormat
      .on('data', (line) => console.log(line))
      .on('err', (line) => console.error(line))
      .on('end', () => console.log('Stream closed for [tb-format]'))

    const tbContStart = await new GenericContainer(
      //'ghcr.io/coilhq/tigerbeetle@sha256:6b1ab1b0355ef254f22fe68a23b92c9559828061190218c7203a8f65d04e395b',//main-0.10.0
      'ghcr.io/coilhq/tigerbeetle:debug-build-no-rel-safe@sha256:0ebd904a64c2c286fddcfc0f6ba115b1c81f8449316520861a42fa3f66923e7f' //Debug-0.10.0
    )
      .withExposedPorts(TIGERBEETLE_PORT)
      .withPrivilegedMode()
      .withBindMount(tigerbeetleDir, TIGERBEETLE_DIR)
      .withCmd([
        'start',
        '--addresses=0.0.0.0:' + TIGERBEETLE_PORT,
        TIGERBEETLE_FILE
      ])
      .withWaitStrategy(Wait.forLogMessage(/listening on/))
      .start()

    const streamTbStart = await tbContStart.logs()
    streamTbStart
      .on('data', (line) => console.log(line))
      .on('err', (line) => console.error(line))
      .on('end', () => console.log('Stream closed for [tb-start]'))

    process.env.TIGERBEETLE_CLUSTER_ID = TIGERBEETLE_CLUSTER_ID
    process.env.TIGERBEETLE_REPLICA_ADDRESSES = `[${tbContStart.getMappedPort(
      TIGERBEETLE_PORT
    )}]`
    global.__BACKEND_TIGERBEETLE__ = tbContStart
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
