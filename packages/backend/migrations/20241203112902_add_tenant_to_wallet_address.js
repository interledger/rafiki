/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return Promise.all([
    knex.schema.alterTable('walletAddresses', function (table) {
      table.foreign(['tenantId']).references('tenants.id')
      table.index(['tenantId'])
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
      table.foreign(['tenantId']).references('tenants.id')
      table.index(['tenantId'])
    })
  ])
}
