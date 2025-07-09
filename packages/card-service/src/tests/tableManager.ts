import { IocContract } from '@adonisjs/fold'
import { Knex } from 'knex'
import { AppServices } from '../app'

export async function truncateTable(
  knex: Knex,
  tableName: string
): Promise<void> {
  const RAW = `TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE`
  await knex.raw(RAW)
}

export async function truncateTables(
  deps: IocContract<AppServices>
): Promise<void> {
  const knex = await deps.use('knex')

  const ignoreTables = [
    'knex_migrations',
    'knex_migrations_lock',
    'card_service_knex_migrations',
    'card_service_knex_migrations_lock'
  ]

  const tables = await getTables(knex, ignoreTables)
  if (tables.length > 0) {
    const RAW = `TRUNCATE TABLE "${tables.join('","')}" RESTART IDENTITY CASCADE`
    await knex.raw(RAW)
  }
}

async function getTables(
  knex: Knex,
  ignoredTables: string[]
): Promise<string[]> {
  const result = await knex.raw(
    `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public'`
  )
  return result.rows
    .map((val: { tablename: string }) => val.tablename)
    .filter((tableName: string) => !ignoredTables.includes(tableName))
}
