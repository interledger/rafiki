/**
 * Nullable: existing grants fall back to managementId (see Grant.getManagementUrl).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('grants', (table) => {
    table.text('managementUrl').nullable()
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('grants', (table) => {
    table.dropColumn('managementUrl')
  })
}
