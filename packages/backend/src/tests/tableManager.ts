import { Knex } from 'knex'
import { Config } from '../config/app'

export async function truncateTable(
  knex: Knex,
  tableName: string
): Promise<void> {
  const RAW = `TRUNCATE TABLE "${tableName}" RESTART IDENTITY`
  await knex.raw(RAW)
}

export async function truncateTables(
  knex: Knex,
  doSeedOperatorTenant = true
): Promise<void> {
  const ignoreTables = [
    'knex_migrations',
    'knex_migrations_lock',
    'knex_migrations_backend',
    'knex_migrations_backend_lock'
  ]
  const tables = await getTables(knex, ignoreTables)
  const RAW = `TRUNCATE TABLE "${tables}" RESTART IDENTITY`
  await knex.raw(RAW)

  if (doSeedOperatorTenant) {
    await seedOperatorTenant(knex)
  }
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

export async function seedOperatorTenant(knex: Knex): Promise<void> {
  await knex
    .table('tenants')
    .insert({ id: Config.operatorTenantId, apiSecret: Config.adminApiSecret })
}
