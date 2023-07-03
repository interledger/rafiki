/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('paymentPointers', (table) => {
    table.timestamp('deactivatedAt').nullable()
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('paymentPointers', (table) => {
    table.dropColumn('deactivatedAt')
  })
}
