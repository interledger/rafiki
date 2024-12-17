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
          SELECT MAX(ctid)
          FROM "walletAddressKeys"
          WHERE revoked = false
          GROUP BY kid, "walletAddressId"
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
