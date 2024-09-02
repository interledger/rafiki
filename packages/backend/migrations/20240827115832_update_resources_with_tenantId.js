/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .table('quotes', function (table) {
      table.uuid('tenantId').notNullable()
      table.foreign('tenantId').references('id').inTable('tenants')
    })
    .table('incomingPayments', function (table) {
      table.uuid('tenantId').notNullable()
      table.foreign('tenantId').references('id').inTable('tenants')
    })
    .table('outgoingPayments', function (table) {
      table.uuid('tenantId').notNullable()
      table.foreign('tenantId').references('id').inTable('tenants')
    })
    .table('walletAddresses', function (table) {
      table.uuid('tenantId').notNullable()
      table.foreign('tenantId').references('id').inTable('tenants')
    })
    .table('grants', function (table) {
      table.uuid('tenantId').notNullable()
      table.foreign('tenantId').references('id').inTable('tenants')
    })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema
    .table('quotes', function (table) {
      table.dropForeign(['tenantId'])
      table.dropColumn('tenantId')
    })
    .table('incomingPayments', function (table) {
      table.dropForeign(['tenantId'])
      table.dropColumn('tenantId')
    })
    .table('outgoingPayments', function (table) {
      table.dropForeign(['tenantId'])
      table.dropColumn('tenantId')
    })
    .table('walletAddresses', function (table) {
      table.dropForeign(['tenantId'])
      table.dropColumn('tenantId')
    })
    .table('grants', function (table) {
      table.dropForeign(['tenantId'])
      table.dropColumn('tenantId')
    })
}
