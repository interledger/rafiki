/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .alterTable('assets', (table) => {
      table.uuid('tenantId').references('tenants.id').index()
      table.dropUnique(['code', 'scale'])
      table.unique(['code', 'scale', 'tenantId'])
    })
    .then(() => {
      return knex.raw(
        `UPDATE "assets" SET "tenantId" = (SELECT id from "tenants" LIMIT 1)`
      )
    })
    .then(() => {
      return knex.schema.alterTable('assets', (table) => {
        table.uuid('tenantId').notNullable().alter()
      })
    })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('assets', (table) => {
    table.dropUnique(['code', 'scale', 'tenantId'])
    table.dropColumn('tenantId')
    table.unique(['code', 'scale'])
  })
}
