/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('quotes', (table) => {
    table.renameColumn('sendAmountValue', 'debitAmountValue')
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('quotes', (table) => {
    table.renameColumn('debitAmountValue', 'sendAmountValue')
  })
}
