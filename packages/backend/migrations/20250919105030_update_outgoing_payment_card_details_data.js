/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('outgoingPaymentCardDetails', function (table) {
    table.dropColumn('expiry')
    table.dropColumn('signature')

    table.uuid('requestId').notNullable()
    table.jsonb('data').notNullable()
    table.timestamp('initiatedAt').notNullable()
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('outgoingPaymentCardDetails', function (table) {
    table.dropColumn('requestId')
    table.dropColumn('data')
    table.dropColumn('initiatedAt')

    table.string('signature').notNullable()
    table.string('expiry').notNullable()
  })
}
