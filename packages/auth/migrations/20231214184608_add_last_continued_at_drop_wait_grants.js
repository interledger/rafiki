/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('grants', function (table) {
    table.timestamp('lastContinuedAt').defaultTo(knex.fn.now())
    table.dropColumn('wait')
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('grants', function (table) {
    table.dropColumn('lastContinuedAt')
    table.integer('wait')
  })
}
