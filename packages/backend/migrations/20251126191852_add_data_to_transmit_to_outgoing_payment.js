/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('outgoingPayments', function (table) {
    table.string('dataToTransmit').nullable()
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('outgoingPayments', function (table) {
    table.dropColumn('dataToTransmit')
  })
}
