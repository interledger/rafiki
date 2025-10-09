/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .alterTable('tenants', (table) => {
      table.string('walletAddressPrefix').unique()
    })
    .then(() => {
      knex.raw(
        `UPDATE "tenants" SET "walletAddressPrefix" = (SELECT "value" from "tenantSettings" WHERE "tenantId" = "tenants"."id" AND "key" = 'WALLET_ADDRESS_URL')`
      )
    })
    .then(() => {
      knex.raw(`DELETE "tenantSettings" WHERE "key" = 'WALLET_ADDRESS_URL'`)
    })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex
    .raw(
      `INSERT INTO "tenantSettings" ("id", "key", "value", "tenantId") SELECT gen_random_uuid(), 'WALLET_ADDRESS_URL', "walletAddressPrefix", "id" FROM "tenants" WHERE "walletAddressPrefix" IS NOT NULL`
    )
    .then(() => {
      return knex.schema.alterTable('tenants', (table) => {
        table.dropColumn('walletAddressPrefix')
      })
    })
}
