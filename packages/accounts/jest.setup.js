// eslint-disable-next-line @typescript-eslint/no-var-requires
const Knex = require('knex')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GenericContainer, Wait } = require('testcontainers')

const POSTGRES_PORT = 5432
const TIGERBEETLE_PORT = 3001

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
    const tigerbeetleContainer = await new GenericContainer(
      'wilsonianbcoil/tigerbeetle'
    )
      .withExposedPorts(TIGERBEETLE_PORT)
      .withCmd([
        '--cluster-id=0a5ca1ab1ebee11e',
        '--replica-index=0',
        '--replica-addresses=0.0.0.0:' + TIGERBEETLE_PORT
      ])
      .withWaitStrategy(Wait.forLogMessage(/listening on/))
      .start()

    process.env.TIGERBEETLE_REPLICA_ADDRESSES = `[${tigerbeetleContainer.getMappedPort(
      TIGERBEETLE_PORT
    )}]`
    global.__TIGERBEETLE__ = tigerbeetleContainer
  }
}
