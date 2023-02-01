exports.up = function (knex) {
  return knex.schema.createTable('outgoingPayments', function (table) {
    table.uuid('id').notNullable().primary()
    table.foreign('id').references('quotes.id')

    table.string('state').notNullable().index() // OutgoingPaymentState
    table.string('error').nullable()
    table.integer('stateAttempts').notNullable().defaultTo(0)
    table.string('description').nullable()
    table.string('externalRef').nullable()

    table.string('client').nullable()

    table.string('grantId').nullable()
    table.foreign('grantId').references('outgoingPaymentGrants.id')

    // Open payments payment pointer corresponding to wallet account
    // from which to request funds for payment
    table.uuid('paymentPointerId').notNullable()
    table.foreign('paymentPointerId').references('paymentPointers.id')

    table.uuid('peerId').nullable()
    table.foreign('peerId').references('peers.id')

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())

    table.index(['paymentPointerId', 'createdAt', 'id'])
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('outgoingPayments')
}
