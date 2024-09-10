/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('incomingPayments', (table) => {
    table.timestamp('approvedAt').nullable()
    table.timestamp('cancelledAt').nullable()
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('incomingPayments', (table) => {
    table.dropColumn('approvedAt')
    table.dropColumn('cancelledAt')
  })
}
