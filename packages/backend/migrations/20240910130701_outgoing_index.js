/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('outgoingPayments', (table) => {
    table.index(['updatedAt', 'stateAttempts'])
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('outgoingPayments', (table) => {
    table.dropIndex(['updatedAt', 'stateAttempts'])
  })
}
