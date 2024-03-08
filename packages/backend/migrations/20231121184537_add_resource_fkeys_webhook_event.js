exports.up = function (knex) {
  return knex.schema
    .table('webhookEvents', function (table) {
      table
        .uuid('outgoingPaymentId')
        .nullable()
        .references('outgoingPayments.id')
        .index()
        .onDelete('CASCADE')
      table
        .uuid('incomingPaymentId')
        .nullable()
        .references('incomingPayments.id')
        .index()
        .onDelete('CASCADE')
      table
        .uuid('walletAddressId')
        .nullable()
        .references('walletAddresses.id')
        .index()
        .onDelete('CASCADE')
      table
        .uuid('peerId')
        .nullable()
        .references('peers.id')
        .index()
        .onDelete('CASCADE')
      table
        .uuid('assetId')
        .nullable()
        .references('assets.id')
        .index()
        .onDelete('CASCADE')
    })
    .then(() => {
      // Delete webhook events with data corresponding to a deleted entity (otherwise this migration will fail when populating the foreign keys in the next step)
      return knex.raw(
        `
        DELETE FROM "webhookEvents" WHERE id IN (
          SELECT "webhookEvents".id FROM "webhookEvents" 
          LEFT JOIN "incomingPayments" ON ("webhookEvents".data->>'id')::uuid = "incomingPayments".id
          WHERE "webhookEvents".type IN ('incoming_payment.created', 'incoming_payment.completed', 'incoming_payment.expired')
          AND "incomingPayments".id IS NULL
        );
  
        DELETE FROM "webhookEvents" WHERE id IN (
          SELECT "webhookEvents".id FROM "webhookEvents"
          LEFT JOIN "outgoingPayments" ON ("webhookEvents".data->>'id')::uuid = "outgoingPayments".id
          WHERE "webhookEvents".type IN ('outgoing_payment.created', 'outgoing_payment.completed','outgoing_payment.failed')
          AND "outgoingPayments".id IS NULL
        );
        
        DELETE FROM "webhookEvents" WHERE id IN (
          SELECT "webhookEvents".id FROM "webhookEvents"
          LEFT JOIN "peers" ON ("webhookEvents".data->>'id')::uuid = "peers".id
          WHERE "webhookEvents".type IN ('peer.liquidity_low')
          AND "peers".id IS NULL
        );
        
        DELETE FROM "webhookEvents" WHERE id IN (
          SELECT "webhookEvents".id FROM "webhookEvents"
          LEFT JOIN "assets" ON ("webhookEvents".data->>'id')::uuid = "assets".id
          WHERE "webhookEvents".type IN ('asset.liquidity_low')
          AND "assets".id IS NULL
        );
        
        DELETE FROM "webhookEvents" WHERE id IN (
          SELECT "webhookEvents".id FROM "webhookEvents"
          LEFT JOIN "walletAddresses" ON ("webhookEvents".data->'walletAddress'->>'id')::uuid = "walletAddresses".id
          WHERE "webhookEvents".type IN ('wallet_address.web_monetization')
          AND "walletAddresses".id IS NULL
        );
        `
      )
    })
    .then(() => {
      return knex('webhookEvents').update({
        incomingPaymentId: knex.raw(
          "CASE WHEN type LIKE 'incoming_payment.%' THEN (data->>'id')::uuid END"
        ),
        outgoingPaymentId: knex.raw(
          "CASE WHEN type LIKE 'outgoing_payment.%' THEN (data->>'id')::uuid END"
        ),
        walletAddressId: knex.raw(
          "CASE WHEN type = 'wallet_address.web_monetization' THEN (data->'walletAddress'->>'id')::uuid END"
        ),
        peerId: knex.raw(
          "CASE WHEN type LIKE 'peer.%' THEN (data->>'id')::uuid END"
        ),
        assetId: knex.raw(
          "CASE WHEN type LIKE 'asset.%' THEN (data->>'id')::uuid END"
        )
      })
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

exports.down = function (knex) {
  return knex.schema
    .raw(
      'ALTER TABLE "webhookEvents" DROP CONSTRAINT IF EXISTS webhookevents_related_resource_constraint'
    )
    .then(() => {
      return knex.schema.table('webhookEvents', function (table) {
        table.dropColumn('incomingPaymentId')
        table.dropColumn('outgoingPaymentId')
        table.dropColumn('walletAddressId')
        table.dropColumn('peerId')
        table.dropColumn('assetId')
      })
    })
}
