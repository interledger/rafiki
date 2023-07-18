/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.raw(`
    CREATE VIEW "combinedPayments" AS
    SELECT
      "id",
      "paymentPointerId",
      "expiresAt",
      "incomingAmountValue",
      "state",
      "connectionId",
      "client",
      "assetId",
      "processAt",
      NULL AS "grantId",
      NULL AS "peerId",
      "createdAt",
      "updatedAt",
      'incoming' AS "paymentType",
      "metadata"
    FROM "incomingPayments"
    UNION ALL
    SELECT
      "id",
      "paymentPointerId",
      NULL AS "expiresAt",
      NULL AS "incomingAmountValue",
      "state",
      NULL AS "connectionId",
      "client",
      NULL AS "assetId",
      NULL AS "processAt",
      "grantId",
      "peerId",
      "createdAt",
      "updatedAt",
      'outgoing' AS "paymentType",
      "metadata"
    FROM "outgoingPayments"
  `)
}
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  // return knex.schema.raw('DROP VIEW IF EXISTS combinedPayments')
  return knex.schema.dropViewIfExists('combinedPayments')
}
