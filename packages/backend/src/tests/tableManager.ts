import { Knex } from 'knex'
import { Tenant } from '../tenants/model'

export async function truncateTable(
  knex: Knex,
  tableName: string
): Promise<void> {
  const RAW = `TRUNCATE TABLE "${tableName}" RESTART IDENTITY`
  await knex.raw(RAW)
}

export async function truncateTables(
  knex: Knex,
  ignoreTables = [
    'knex_migrations',
    'knex_migrations_lock',
    'knex_migrations_backend',
    'knex_migrations_backend_lock',
    // We always keep the [cf5fd7d3-1eb1-4041-8e43-ba45747e9e5d] tenant for our test case.
    Tenant.tableName
  ]
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
