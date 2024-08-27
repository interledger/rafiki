/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.table('grants', function (table) {
    table.uuid('tenantId').notNullable()
    table.foreign('tenantId').references('id').inTable('tenants')
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.table('grants', function (table) {
    table.dropForeign(['tenantId'])
    table.dropColumn('tenantId')
  })
}
