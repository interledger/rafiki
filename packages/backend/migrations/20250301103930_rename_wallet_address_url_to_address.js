/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('walletAddresses', (table) => {
    table.renameColumn('url', 'address')
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('walletAddresses', (table) => {
    table.renameColumn('address', 'url')
  })
}
