import Knex from 'knex'

export async function truncateTable(
  knex: Knex,
  tableName: string
): Promise<void> {
  const RAW = `TRUNCATE TABLE "${tableName}" RESTART IDENTITY`
  await knex.raw(RAW)
}

export async function truncateTables(
  knex: Knex,
  ignoreTables = ['auth_knex_migrations', 'auth_knex_migrations_lock']
): Promise<void> {
  const tables = await getTables(knex, ignoreTables)
  const RAW = `TRUNCATE TABLE "${tables}" RESTART IDENTITY`
  await knex.raw(RAW)
}

async function getTables(knex: Knex, ignoredTables: string[]): Promise<string> {
  const result = await knex.raw(
    "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public'"
  )
  return result.rows
    .map((val: { tablename: string }) => {
      if (!ignoredTables.includes(val.tablename)) return val.tablename
    })
    .filter(Boolean)
    .join('","')
}
