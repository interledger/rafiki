/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  // delete any existing duplicates per wallet address
  knex.raw(`
  DELETE FROM walletAddressKeys
    WHERE ctid NOT IN (
      SELECT MIN(ctid)
      FROM walletAddressKeys
      GROUP BY walletAddressId, kid, x
    );
  `)

  return knex.schema.alterTable('walletAddressKeys', (table) => {
    table.unique(['walletAddressId', 'kid', 'x'])
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('walletAddressKeys', (table) => {
    table.dropUnique(['walletAddressId', 'kid', 'x'])
  })
}
