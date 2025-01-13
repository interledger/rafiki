/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return Promise.all([
    knex.schema.alterTable('walletAddresses', function (table) {
      table.uuid('tenantId').notNullable()
      table.foreign(['tenantId']).references('tenants.id')
    })
  ])
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return Promise.all([
    knex.schema.alterTable('walletAddresses', function (table) {
      table.dropIndex('tenantId')
      table.dropColumn('tenantId')
    })
  ])
}
