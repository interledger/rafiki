/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('cardPayments', function (table) {
    table.uuid('id').notNullable().primary()
    table.uuid('requestId').notNullable().unique()

    table.timestamp('requestedAt').defaultTo(knex.fn.now())
    table.timestamp('finalizedAt').nullable()

    table.string('cardWalletAddress').notNullable()
    table.string('incomingPaymentUrl').notNullable()

    table.integer('statusCode').nullable()

    table.uuid('outgoingPaymentId')
    table.uuid('terminalId')

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())

    table.index('requestId')
    table.index('cardWalletAddress')
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('cardPayments')
}
