/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .alterTable('peers', function (table) {
      table.uuid('tenantId')
      table.foreign('tenantId').references('id').inTable('tenants')
    })
    .then(() => {
      return knex.raw(
        `UPDATE "peers" SET "tenantId" = (SELECT id from "tenants" LIMIT 1)`
      )
    })
    .then(() => {
      return knex.schema.alterTable('peers', function (table) {
        table.uuid('tenantId').notNullable().alter()
      })
    })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('peers', (table) => {
    table.dropForeign('tenantId')
    table.dropColumn('tenantId')
  })
}
