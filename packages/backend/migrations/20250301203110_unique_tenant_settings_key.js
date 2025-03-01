/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('tenantSettings', function (table) {
    table.unique(['tenantId', 'key'])
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('tenantSettings', function (table) {
    table.dropUnique(['tenantId', 'key'])
  })
}
