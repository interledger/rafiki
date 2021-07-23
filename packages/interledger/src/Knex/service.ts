import Knex from 'knex'

export async function createKnex(databaseUrl: string): Promise<Knex> {
  const db = Knex({
    client: 'postgresql',
    connection: databaseUrl,
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      directory: '../../',
      tableName: 'knex_migrations'
    }
  })
  // node pg defaults to returning bigint as string. This ensures it parses to bigint
  db.client.driver.types.setTypeParser(
    db.client.driver.types.builtins.INT8,
    'text',
    BigInt
  )
  return db
}
