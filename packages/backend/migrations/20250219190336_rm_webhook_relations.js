// TODO: rm? added because i thought it might have impact on performance, but it does not seem to.

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('webhookEvents', (table) => {
    table.dropForeign(['assetId'], 'webhookevents_assetid_foreign')
    table.dropForeign(
      ['incomingPaymentId'],
      'webhookevents_incomingpaymentid_foreign'
    )
    table.dropForeign(
      ['outgoingPaymentId'],
      'webhookevents_outgoingpaymentid_foreign'
    )
    table.dropForeign(['peerId'], 'webhookevents_peerid_foreign')
    table.dropForeign(
      ['walletAddressId'],
      'webhookevents_walletaddressid_foreign'
    )
    table.dropForeign(
      ['withdrawalAssetId'],
      'webhookevents_withdrawalassetid_foreign'
    )
  })

  return await knex.raw(
    'ALTER TABLE "webhookEvents" DROP CONSTRAINT "webhookevents_related_resource_constraint";'
  )
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('webhookEvents', (table) => {
    // Re-add foreign keys
    table
      .foreign('assetId', 'webhookevents_assetid_foreign')
      .references('assets.id')
      .onDelete('CASCADE')
    table
      .foreign('incomingPaymentId', 'webhookevents_incomingpaymentid_foreign')
      .references('incomingPayments.id')
      .onDelete('CASCADE')
    table
      .foreign('outgoingPaymentId', 'webhookevents_outgoingpaymentid_foreign')
      .references('outgoingPayments.id')
      .onDelete('CASCADE')
    table
      .foreign('peerId', 'webhookevents_peerid_foreign')
      .references('peers.id')
      .onDelete('CASCADE')
    table
      .foreign('walletAddressId', 'webhookevents_walletaddressid_foreign')
      .references('walletAddresses.id')
      .onDelete('CASCADE')
    table
      .foreign('withdrawalAssetId', 'webhookevents_withdrawalassetid_foreign')
      .references('assets.id')
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

    // Re-add the check constraint
    // table.check(
    //   knex.raw(`
    //     CASE
    //       WHEN type <> 'wallet_address.not_found' THEN
    //         (("outgoingPaymentId" IS NOT NULL)::integer +
    //          ("incomingPaymentId" IS NOT NULL)::integer +
    //          ("walletAddressId" IS NOT NULL)::integer +
    //          ("peerId" IS NOT NULL)::integer +
    //          ("assetId" IS NOT NULL)::integer) = 1
    //       ELSE
    //         (("outgoingPaymentId" IS NOT NULL)::integer +
    //          ("incomingPaymentId" IS NOT NULL)::integer +
    //          ("walletAddressId" IS NOT NULL)::integer +
    //          ("peerId" IS NOT NULL)::integer +
    //          ("assetId" IS NOT NULL)::integer) = 0
    //     END
    //   `),
    //   'webhookevents_related_resource_constraint'
    // )
  })
}
