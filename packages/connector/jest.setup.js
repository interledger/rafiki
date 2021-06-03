// eslint-disable-next-line @typescript-eslint/no-var-requires
const Knex = require('knex')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const IORedis = require('ioredis')
const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:password@localhost:5432/testing'
const redis = new IORedis('redis://127.0.0.1:6379')

module.exports = async () => {
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
  await knex.migrate.latest({
    directory: __dirname + '/migrations'
  })
  global.__KNEX__ = knex

  if (redis.status === 'ready') {
    await redis.disconnect()
  } else {
    throw new Error('expected redis at 127.0.0.1:6379')
  }
}
