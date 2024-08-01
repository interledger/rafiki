/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  // delete any existing duplicates
  knex.raw(`
    DELETE FROM walletAddressKeys
    WHERE ctid NOT IN (
      SELECT MIN(ctid)
      FROM walletAddressKeys
      GROUP BY kid, x
    );
  `);

  return knex.schema.alterTable('walletAddressKeys', (table) => {
    table.unique(['kid', 'x']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('walletAddressKeys', (table) => {
    table.dropUnique(['kid', 'x']);
  });
};
