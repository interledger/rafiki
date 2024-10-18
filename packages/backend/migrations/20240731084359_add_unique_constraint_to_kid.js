/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // delete any existing duplicates per wallet address, keep latest version
  await knex.raw(`
    DELETE FROM "walletAddressKeys"
    WHERE ctid NOT IN (
      SELECT ctid FROM (
        SELECT "walletAddressId", kid, x, MAX("createdAt") AS latest_added, MAX(ctid) AS ctid
        FROM "walletAddressKeys"
        GROUP BY "walletAddressId", kid, x
      ) subquery
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
