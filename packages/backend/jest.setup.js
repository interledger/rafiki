// eslint-disable-next-line @typescript-eslint/no-var-requires
const Knex = require('knex')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GenericContainer } = require('testcontainers')

const POSTGRES_PORT = 5432
const REDIS_PORT = 6379

module.exports = async () => {
  const postgresContainer = await new GenericContainer('postgres')
    .withExposedPorts(POSTGRES_PORT)
    .withBindMount(
      __dirname + '/scripts/init.sh',
      '/docker-entrypoint-initdb.d/init.sh'
    )
    .withEnv('POSTGRES_PASSWORD', 'password')
    .start()

  const DATABASE_URL = `postgresql://postgres:password@localhost:${postgresContainer.getMappedPort(
    POSTGRES_PORT
  )}/testing`

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
  knex.client.driver.types.setTypeParser(
    knex.client.driver.types.builtins.INT8,
    'text',
    BigInt
  )
  await knex.migrate.latest({
    directory: './packages/backend/migrations'
  })
  process.env.DATABASE_URL = DATABASE_URL
  global.__BACKEND_KNEX__ = knex
  global.__BACKEND_POSTGRES__ = postgresContainer

  const redisContainer = await new GenericContainer('redis')
    .withExposedPorts(REDIS_PORT)
    .start()

  global.__BACKEND_REDIS__ = redisContainer
  process.env.REDIS_URL = `redis://localhost:${redisContainer.getMappedPort(
    REDIS_PORT
  )}`
}
