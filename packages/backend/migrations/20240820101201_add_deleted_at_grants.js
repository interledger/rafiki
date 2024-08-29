/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('grants', (table) => {
    table.dropUnique(['authServerId', 'accessType', 'accessActions'])
    table.timestamp('deletedAt').nullable()
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('grants', (table) => {
    table.unique(['authServerId', 'accessType', 'accessActions'])
    table.dropColumn('deletedAt')
  })
}
