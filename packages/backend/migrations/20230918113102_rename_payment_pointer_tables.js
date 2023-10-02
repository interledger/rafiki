/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return Promise.all([
    knex.schema.renameTable('paymentPointers', 'walletAddresses'),
    knex.schema.renameTable('paymentPointerKeys', 'walletAddressKeys'),
    knex.schema.alterTable('walletAddressKeys', function (table) {
      table.renameColumn('paymentPointerId', 'walletAddressId')
      table.foreign('walletAddressId').references('walletAddresses.id')
    }),
    knex.schema.alterTable('quotes', function (table) {
      table.renameColumn('paymentPointerId', 'walletAddressId')
      table.foreign('walletAddressId').references('walletAddresses.id')
      table.index(['walletAddressId', 'createdAt', 'id'])
    }),
    knex.schema.alterTable('incomingPayments', function (table) {
      table.renameColumn('paymentPointerId', 'walletAddressId')
      table.foreign('walletAddressId').references('walletAddresses.id')
      table.index(['walletAddressId', 'createdAt', 'id'])
    }),
    knex.schema.alterTable('outgoingPayments', function (table) {
      table.renameColumn('paymentPointerId', 'walletAddressId')
      table.foreign('walletAddressId').references('walletAddresses.id')
      table.index(['walletAddressId', 'createdAt', 'id'])
    }),
    knex('webhookEvents')
      .update({
        // renames paymentPointer keys (if any) to walletAddress in data json column
        data: knex.raw(
          "data - 'paymentPointer' || json_build_object('walletAddress', data->'paymentPointer')"
        )
      })
      .whereRaw("data \\? 'paymentPonter'")
  ])
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return Promise.all([
    knex.schema.renameTable('walletAddresses', 'paymentPointers'),
    knex.schema.renameTable('walletAddressKeys', 'paymentPointerKeys'),
    knex.schema.alterTable('paymentPointerKeys', function (table) {
      table.renameColumn('walletAddressId', 'paymentPointerId')
      table.foreign('paymentPointerId').references('paymentPointers.id')
    }),
    knex.schema.alterTable('quotes', function (table) {
      table.renameColumn('walletAddressId', 'paymentPointerId')
      table.foreign('paymentPointerId').references('paymentPointers.id')
      table.index(['paymentPointerId', 'createdAt', 'id'])
    }),
    knex.schema.alterTable('incomingPayments', function (table) {
      table.renameColumn('walletAddressId', 'paymentPointerId')
      table.foreign('paymentPointerId').references('paymentPointers.id')
      table.index(['paymentPointerId', 'createdAt', 'id'])
    }),
    knex.schema.alterTable('outgoingPayments', function (table) {
      table.renameColumn('walletAddressId', 'paymentPointerId')
      table.foreign('paymentPointerId').references('paymentPointers.id')
      table.index(['paymentPointerId', 'createdAt', 'id'])
    }),
    knex('webhookEvents')
      .update({
        data: knex.raw(
          "data - 'walletAddress' || json_build_object('paymentPointer', data->'walletAddress')"
        )
      })
      .whereRaw("data \\? 'walletAddress'")
  ])
}
