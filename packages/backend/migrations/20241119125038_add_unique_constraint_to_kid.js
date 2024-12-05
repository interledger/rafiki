/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  return knex
    .raw(
      // Keep only one active walletAddressKey (the most recent one)
      `DELETE FROM "walletAddressKeys" w
       WHERE revoked = false
       AND w."createdAt" = (
          SELECT "createdAt"
          FROM "walletAddressKeys"
          WHERE revoked = false
            AND kid = w.kid
          ORDER BY "createdAt" DESC
          LIMIT 1
       )
       /* 
        if there are multiple keys that have the most recent "createdAt",
        we keep just one of them and delete the rest
       */
       AND w.id <> (
          SELECT id
          FROM "walletAddressKeys"
          WHERE revoked = false
            AND kid = w.kid
          ORDER BY "createdAt" DESC
          LIMIT 1 OFFSET 1
       );
      `
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
