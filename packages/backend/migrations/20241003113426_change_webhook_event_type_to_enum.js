/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex
    .raw(
      'ALTER TABLE "webhookEvents" DROP CONSTRAINT IF EXISTS "webhookevents_related_resource_constraint"'
    )
    .then(() => {
      // Update webhook event type to the enum standard
      return knex.table('webhookEvents').update({
        type: knex.raw(`REPLACE(UPPER(type), '.', '_')`)
      })
    })
    .then(() => {
      // Update the constraint webhookevents_related_resource_constraint to match the enum change
      return knex.table('webhookEvents', function (table) {
        table.check(
          ` (CASE WHEN type != 'WALLET_ADDRESS_NOT_FOUND' THEN
            (
                ("outgoingPaymentId" IS NOT NULL)::int +
                ("incomingPaymentId" IS NOT NULL)::int +
                ("walletAddressId" IS NOT NULL)::int +
                ("peerId" IS NOT NULL)::int +
                ("assetId" IS NOT NULL)::int
            ) = 1
            ELSE
            (
                ("outgoingPaymentId" IS NOT NULL)::int +
                ("incomingPaymentId" IS NOT NULL)::int +
                ("walletAddressId" IS NOT NULL)::int +
                ("peerId" IS NOT NULL)::int +
                ("assetId" IS NOT NULL)::int
            ) = 0
            END)
            `,
          null,
          'webhookevents_related_resource_constraint'
        )
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
      'ALTER TABLE "webhookEvents" DROP CONSTRAINT IF EXISTS "webhookevents_related_resource_constraint"'
    )
    .then(() => {
      return knex.table('webhookEvents').update({
        type: knex.raw(`LOWER(type)`)
      })
    })
    .then(() => {
      return knex.raw(`UPDATE "webhookEvents" SET type = (
          CASE
            WHEN type LIKE '%payment%' THEN REPLACE(type, 'payment_', 'payment.')
            WHEN type LIKE 'wallet_address_%' THEN REPLACE(type, 'address_', 'address.')
            WHEN type LIKE '%liquidity%' THEN REPLACE(type, '_liquidity', '.liquidity')
          END
        )`)
    })
    .then(() => {
      return knex.schema.table('webhookEvents', function (table) {
        table.check(
          ` (CASE WHEN type != 'wallet_address.not_found' THEN
            (
                ("outgoingPaymentId" IS NOT NULL)::int +
                ("incomingPaymentId" IS NOT NULL)::int +
                ("walletAddressId" IS NOT NULL)::int +
                ("peerId" IS NOT NULL)::int +
                ("assetId" IS NOT NULL)::int
            ) = 1
            ELSE
            (
                ("outgoingPaymentId" IS NOT NULL)::int +
                ("incomingPaymentId" IS NOT NULL)::int +
                ("walletAddressId" IS NOT NULL)::int +
                ("peerId" IS NOT NULL)::int +
                ("assetId" IS NOT NULL)::int
            ) = 0
            END)
            `,
          null,
          'webhookevents_related_resource_constraint'
        )
      })
    })
}
