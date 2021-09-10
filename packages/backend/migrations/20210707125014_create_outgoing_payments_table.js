exports.up = function (knex) {
  return knex.schema.createTable('outgoingPayments', function (table) {
    table.uuid('id').notNullable().primary()

    table.string('state').notNullable().index() // PaymentState
    table.string('error').nullable()
    table.integer('stateAttempts').notNullable().defaultTo(0)

    table.string('intentPaymentPointer').nullable()
    table.string('intentInvoiceUrl').nullable()
    table.bigInteger('intentAmountToSend').nullable()
    table.boolean('intentAutoApprove').notNullable()

    table.timestamp('quoteTimestamp').nullable()
    table.timestamp('quoteActivationDeadline').nullable()
    table.string('quoteTargetType').nullable() // 'FixedSend' | 'FixedDelivery'
    table.bigInteger('quoteMinDeliveryAmount').nullable()
    table.bigInteger('quoteMaxSourceAmount').nullable()
    table.bigInteger('quoteMaxPacketAmount').nullable()
    table.float('quoteMinExchangeRate').nullable()
    table.float('quoteLowExchangeRateEstimate').nullable()
    table.float('quoteHighExchangeRateEstimate').nullable()

    table.string('superAccountId').notNullable()
    table.string('sourceAccountId').notNullable()
    table.integer('sourceAccountScale').notNullable()
    table.string('sourceAccountCode').notNullable()
    table.integer('destinationAccountScale').notNullable()
    table.string('destinationAccountCode').notNullable()
    table.string('destinationAccountUrl').nullable()
    table.string('destinationAccountPaymentPointer').nullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('outgoingPayments')
}
