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
      return knex.raw(
        `UPDATE "tenants" SET "walletAddressPrefix" = (SELECT "value" from "tenantSettings" WHERE "tenantId" = "tenants"."id" AND "key" = 'WALLET_ADDRESS_URL')`
      )
    })
    .then(() => {
      return knex.raw(
        `DELETE FROM "tenantSettings" WHERE "key" = 'WALLET_ADDRESS_URL'`
      )
    })
    .then(() => {
      return knex.raw(
        `UPDATE "tenants" SET "walletAddressPrefix" = '${process.env.OPEN_PAYMENTS_URL}/' || gen_random_uuid() WHERE "walletAddressPrefix" IS NULL`
      )
    })
    .then(() => {
      return knex.schema.alterTable('tenants', (table) => {
        table.dropNullable('walletAddressPrefix')
      })
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
