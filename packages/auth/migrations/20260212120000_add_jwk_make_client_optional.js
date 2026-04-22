/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('grants', function (table) {
    table.string('client').nullable().alter()
    table.jsonb('jwk').nullable()
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('grants', function (table) {
    table.string('client').notNullable().alter()
    table.dropColumn('jwk')
  })
}
