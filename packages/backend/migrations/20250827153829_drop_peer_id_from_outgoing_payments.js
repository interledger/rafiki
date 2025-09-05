/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('outgoingPayments', function (table) {
    table.dropForeign(['peerId'])
    table.dropColumn('peerId')
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('outgoingPayments', function (table) {
    table.uuid('peerId').nullable()
    table.foreign('peerId').references('peers.id')
  })
}
