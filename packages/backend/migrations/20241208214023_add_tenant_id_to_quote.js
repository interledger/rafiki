/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('quotes', function (table) {
    table.uuid('tenantId').notNullable()
    table.foreign('tenantId').references('tenants.id').onDelete('CASCADE')
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('quotes', function (table) {
    table.dropForeign('tenantId')
    table.dropColumn('tenantId')
  })
}
