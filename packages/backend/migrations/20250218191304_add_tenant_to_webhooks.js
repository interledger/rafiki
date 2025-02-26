/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .alterTable('webhookEvents', (table) => {
      table.uuid('tenantId').references('tenants.id').index()
    })
    .then(() => {
      return knex.raw(
        `UPDATE "webhookEvents" SET "tenantId" = (SELECT id from "tenants" LIMIT 1)`
      )
    })
    .then(() => {
      return knex.schema.alterTable('webhookEvents', (table) => {
        table.uuid('tenantId').notNullable().alter()
      })
    })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('webhookEvents', function (table) {
    table.dropColumn('tenantId')
  })
}
