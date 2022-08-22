import { Knex } from 'knex'

export async function resetGraphileDb(knex: Knex): Promise<void> {
  await knex.raw('drop schema if exists graphile_worker cascade;')
  await knex.raw('drop extension if exists pgcrypto cascade;')
}
