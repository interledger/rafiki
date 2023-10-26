/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return Promise.all([
    knex.schema.renameTable('paymentPointers', 'walletAddresses'),
    knex.schema.alterTable('walletAddresses', function (table) {
      table.foreign(['assetId']).references('assets.id')
      table.unique('url')
    }),
    knex.raw(
      'ALTER INDEX "paymentPointers_pkey" RENAME TO "walletAddresses_pkey"'
    ),
    knex.raw(
      'ALTER INDEX "paymentpointers_url_index" RENAME TO "walletaddresses_url_index"'
    ),
    knex.raw(
      'ALTER INDEX "paymentpointers_processat_index" RENAME TO "walletaddresses_processat_index"'
    ),
    knex.raw(
      'ALTER TABLE "walletAddresses" DROP CONSTRAINT "paymentpointers_url_unique"'
    ),
    knex.raw(
      'ALTER TABLE "walletAddresses" DROP CONSTRAINT "paymentpointers_assetid_foreign"'
    ),
    knex.schema.renameTable('paymentPointerKeys', 'walletAddressKeys'),
    knex.schema.alterTable('walletAddressKeys', function (table) {
      table.renameColumn('paymentPointerId', 'walletAddressId')
      table.foreign('walletAddressId').references('walletAddresses.id')
    }),
    knex.raw(
      'ALTER INDEX "paymentPointerKeys_pkey" RENAME TO "walletAddressKeys_pkey"'
    ),
    knex.raw(
      'ALTER TABLE "walletAddressKeys" DROP CONSTRAINT "paymentpointerkeys_paymentpointerid_foreign"'
    ),
    knex.schema.alterTable('quotes', function (table) {
      table.dropForeign(['paymentPointerId'])
      table.dropIndex(['paymentPointerId', 'createdAt', 'id'])
      table.renameColumn('paymentPointerId', 'walletAddressId')
      table.foreign('walletAddressId').references('walletAddresses.id')
      table.index(['walletAddressId', 'createdAt', 'id'])
    }),
    knex.schema.alterTable('incomingPayments', function (table) {
      table.dropForeign(['paymentPointerId'])
      table.dropIndex(['paymentPointerId', 'createdAt', 'id'])
      table.renameColumn('paymentPointerId', 'walletAddressId')
      table.foreign('walletAddressId').references('walletAddresses.id')
      table.index(['walletAddressId', 'createdAt', 'id'])
    }),
    knex.schema.alterTable('outgoingPayments', function (table) {
      table.dropForeign(['paymentPointerId'])
      table.dropIndex(['paymentPointerId', 'createdAt', 'id'])
      table.renameColumn('paymentPointerId', 'walletAddressId')
      table.foreign('walletAddressId').references('walletAddresses.id')
      table.index(['walletAddressId', 'createdAt', 'id'])
    }),
    knex('webhookEvents')
      .update({
        // renames paymentPointer keys (if any) to walletAddress in data json column
        data: knex.raw(
          "data::jsonb - 'paymentPointer' || jsonb_build_object('walletAddress', data::jsonb->'paymentPointer')"
        )
      })
      .whereRaw("data->'paymentPointer' is not null"),
    knex('webhookEvents')
      .update({
        // renames paymentPointerId keys (if any) to walletAddressId in data json column
        data: knex.raw(
          "data::jsonb - 'paymentPointerId' || jsonb_build_object('walletAddressId', data::jsonb->'paymentPointerId')"
        )
      })
      .whereRaw("data->'paymentPointerId' is not null"),
    knex('webhookEvents')
      .update({
        // renames paymentPointerUrl keys (if any) to walletAddressUrl in data json column
        data: knex.raw(
          "data::jsonb - 'paymentPointerUrl' || jsonb_build_object('walletAddressUrl', data::jsonb->'paymentPointerUrl')"
        )
      })
      .whereRaw("data->'paymentPointerUrl' is not null"),
    knex('webhookEvents')
      .update({
        // renames payment_pointer.not_found values (if any) to wallet_address.not_found for type key in data json column
        type: knex.raw("REPLACE(type, 'payment_pointer.', 'wallet_address.')")
      })
      .whereLike('type', 'payment_pointer%'),
    knex.schema.alterView('combinedPaymentsView', function (view) {
      view.column('paymentPointerId').rename('walletAddressId')
    })
  ])
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return Promise.all([
    knex.schema.renameTable('walletAddresses', 'paymentPointers'),
    knex.schema.alterTable('paymentPointers', function (table) {
      table.foreign(['assetId']).references('assets.id')
      table.unique('url')
    }),
    knex.raw(
      'ALTER INDEX "walletAddresses_pkey" RENAME TO "paymentPointers_pkey"'
    ),
    knex.raw(
      'ALTER INDEX "walletaddresses_url_index" RENAME TO "paymentpointers_url_index"'
    ),
    knex.raw(
      'ALTER INDEX "walletaddresses_processat_index" RENAME TO "paymentpointers_processat_index"'
    ),
    knex.raw(
      'ALTER TABLE "paymentPointers" DROP CONSTRAINT "walletaddresses_url_unique"'
    ),
    knex.raw(
      'ALTER TABLE "paymentPointers" DROP CONSTRAINT "walletaddresses_assetid_foreign"'
    ),
    knex.schema.renameTable('walletAddressKeys', 'paymentPointerKeys'),
    knex.schema.alterTable('paymentPointerKeys', function (table) {
      table.renameColumn('walletAddressId', 'paymentPointerId')
      table.foreign('paymentPointerId').references('paymentPointers.id')
    }),
    knex.raw(
      'ALTER INDEX "walletAddressKeys_pkey" RENAME TO "paymentPointerKeys_pkey"'
    ),
    knex.raw(
      'ALTER TABLE "paymentPointerKeys" DROP CONSTRAINT "walletaddresskeys_walletaddressid_foreign"'
    ),
    knex.schema.alterTable('quotes', function (table) {
      table.dropForeign(['walletAddressId'])
      table.dropIndex(['walletAddressId', 'createdAt', 'id'])
      table.renameColumn('walletAddressId', 'paymentPointerId')
      table.foreign('paymentPointerId').references('paymentPointers.id')
      table.index(['paymentPointerId', 'createdAt', 'id'])
    }),
    knex.schema.alterTable('incomingPayments', function (table) {
      table.dropForeign(['walletAddressId'])
      table.dropIndex(['walletAddressId', 'createdAt', 'id'])
      table.renameColumn('walletAddressId', 'paymentPointerId')
      table.foreign('paymentPointerId').references('paymentPointers.id')
      table.index(['paymentPointerId', 'createdAt', 'id'])
    }),
    knex.schema.alterTable('outgoingPayments', function (table) {
      table.dropForeign(['walletAddressId'])
      table.dropIndex(['walletAddressId', 'createdAt', 'id'])
      table.renameColumn('walletAddressId', 'paymentPointerId')
      table.foreign('paymentPointerId').references('paymentPointers.id')
      table.index(['paymentPointerId', 'createdAt', 'id'])
    }),
    knex('webhookEvents')
      .update({
        data: knex.raw(
          "data::jsonb - 'walletAddress' || jsonb_build_object('paymentPointer', data::jsonb->'walletAddress')"
        )
      })
      .whereRaw("data->'walletAddress' is not null"),
    knex('webhookEvents')
      .update({
        data: knex.raw(
          "data::jsonb - 'walletAddressId' || jsonb_build_object('paymentPointerId', data::jsonb->'walletAddressId')"
        )
      })
      .whereRaw("data->'walletAddressId' is not null"),
    knex('webhookEvents')
      .update({
        data: knex.raw(
          "data::jsonb - 'walletAddressUrl' || jsonb_build_object('paymentPointerUrl', data::jsonb->'walletAddressUrl')"
        )
      })
      .whereRaw("data->'walletAddressUrl' is not null"),
    knex('webhookEvents')
      .update({
        type: knex.raw("REPLACE(type, 'wallet_address.', 'payment_pointer.')")
      })
      .whereLike('type', 'wallet_address%'),
    knex.schema.alterView('combinedPaymentsView', function (view) {
      view.column('walletAddressId').rename('paymentPointerId')
    })
  ])
}
