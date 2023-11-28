/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('peers', (table) => {
    table.unique(['assetId', 'staticIlpAddress'])
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('peers', (table) => {
    table.dropUnique(['assetId', 'staticIlpAddress'])
  })
}
