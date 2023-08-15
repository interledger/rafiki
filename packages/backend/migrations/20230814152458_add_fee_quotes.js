/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('quotes', function (table) {
    table.uuid('feeId') //.notNullable()
    // TODO: make fkey when fee table added
    // table.foreign('feeId').references('fee.id')
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('quotes', function (table) {
    table.dropColumn('feeId')
  })
}
