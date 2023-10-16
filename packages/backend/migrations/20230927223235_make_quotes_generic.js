/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('quotes', (table) => {
    table.json('additionalFields').nullable()
    table.decimal('estimatedExchangeRate', 20, 10).nullable()
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('quotes', (table) => {
    table.dropColumn('additionalFields')
    table.dropColumn('estimatedExchangeRate')
  })
}
