/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.raw(`
    DROP VIEW IF EXISTS "combinedPaymentsView";
    CREATE VIEW "combinedPaymentsView" AS
    SELECT
      "id",
      "walletAddressId",
      "state",
      "client",
      "createdAt",
      "updatedAt",
      "metadata",
      "tenantId",
      'INCOMING' AS "type"
    FROM "incomingPayments"
    UNION ALL
    SELECT
      "id",
      "walletAddressId",
      "state",
      "client",
      "createdAt",
      "updatedAt",
      "metadata",
      "tenantId",
      'OUTGOING' AS "type"
    FROM "outgoingPayments"
  `)
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.raw(`
    DROP VIEW IF EXISTS "combinedPaymentsView";
    CREATE VIEW "combinedPaymentsView" AS
    SELECT
      "id",
      "walletAddressId",
      "state",
      "client",
      "createdAt",
      "updatedAt",
      "metadata",
      'INCOMING' AS "type"
    FROM "incomingPayments"
    UNION ALL
    SELECT
      "id",
      "walletAddressId",
      "state",
      "client",
      "createdAt",
      "updatedAt",
      "metadata",
      'OUTGOING' AS "type"
    FROM "outgoingPayments"
  `)
}
