/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('webhookEvents', function (table) {
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

    // Ensure a max of one of these foreign keys is set
    table.check(
      `
        (
          ("outgoingPaymentId" IS NOT NULL)::int +
          ("incomingPaymentId" IS NOT NULL)::int +
          ("walletAddressId" IS NOT NULL)::int
        ) IN (0, 1)
      `,
      null,
      'check_single_column'
    )
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('webhookEvents', function (table) {
    table.dropColumn('outgoingPaymentId')
    table.dropColumn('incomingPaymentId')
    table.dropColumn('walletAddressId')
  })
}
