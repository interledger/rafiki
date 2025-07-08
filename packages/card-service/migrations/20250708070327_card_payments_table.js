/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('cardPayments', function (table) {
    table.uuid('id').notNullable().primary()
    table.uuid('requestId').notNullable()

    table.timestamp('requestedAt').defaultTo(knex.fn.now())
    table.timestamp('finalizedAt').defaultTo(knex.fn.now())

    table.string('cardWalletAddress').notNullable()
    table.string('incomingPaymentUrl').notNullable()

    table.integer('statusCode').nullable()

    table.uuid('outgoingPaymentId')
    table.uuid('terminalId')

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())

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
