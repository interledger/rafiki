/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('incomingPayments', function (table) {
    table.string('senderWalletAddress').nullable()
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('incomingPayments', function (table) {
    table.dropColumn('senderWalletAddress')
  })
}
