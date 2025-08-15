/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('incomingPayments', function (table) {
    table.enum('initiatedBy', ['CARD', 'OPEN_PAYMENTS', 'ADMIN']).notNullable()
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('incomingPayments', function (table) {
    table.dropColumn('initiatedBy')
  })
}
