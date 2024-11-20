/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  return knex.raw(`
      CREATE UNIQUE INDEX "wallet_address_keys_revoked_false_idx"
      ON "walletAddressKeys" ("walletAddressId", kid, x)
      WHERE revoked = false;
  `)
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.raw(
    `DROP INDEX IF EXISTS "wallet_address_keys_revoked_false_idx"`
  )
}
