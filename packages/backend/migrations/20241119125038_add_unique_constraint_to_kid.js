/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  return knex
    .raw(
      // Keep only one active walletAddressKey (the most recent row)
      `DELETE FROM "walletAddressKeys" w
       WHERE revoked = false
       AND ctid NOT IN (
          SELECT MIN(ctid)
          FROM "walletAddressKeys"
          WHERE revoked = false
            AND kid = w.kid
       )`
    )
    .then(() => {
      return knex.raw(`
        CREATE UNIQUE INDEX "wallet_address_keys_revoked_false_idx"
        ON "walletAddressKeys" ("walletAddressId", kid)
        WHERE revoked = false;
      `)
    })
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
