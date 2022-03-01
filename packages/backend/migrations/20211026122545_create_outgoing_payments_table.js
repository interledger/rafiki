exports.up = function (knex) {
  return knex.schema.createTable('outgoingPayments', function (table) {
    table.uuid('id').notNullable().primary()

    table.string('state').notNullable().index() // PaymentState
    table.string('error').nullable()
    table.integer('stateAttempts').notNullable().defaultTo(0)

    table.string('intentPaymentPointer').nullable()
    table.string('intentIncomingPaymentUrl').nullable()
    table.bigInteger('intentAmountToSend').nullable()
    table.boolean('intentAutoApprove').notNullable()

    table.timestamp('quoteTimestamp').nullable()
    table.timestamp('quoteActivationDeadline').nullable()
    table.string('quoteTargetType').nullable() // 'FixedSend' | 'FixedDelivery'
    table.bigInteger('quoteMinDeliveryAmount').nullable()
    table.bigInteger('quoteMaxSourceAmount').nullable()
    table.bigInteger('quoteMaxPacketAmount').nullable()

    table.bigInteger('quoteMinExchangeRateNumerator').nullable()
    table.bigInteger('quoteMinExchangeRateDenominator').nullable()
    table.bigInteger('quoteLowExchangeRateEstimateNumerator').nullable()
    table.bigInteger('quoteLowExchangeRateEstimateDenominator').nullable()
    table.bigInteger('quoteHighExchangeRateEstimateNumerator').nullable()
    table.bigInteger('quoteHighExchangeRateEstimateDenominator').nullable()

    // Amount already sent at the time of the quote
    table.bigInteger('quoteAmountSent').nullable()

    // Open payments account corresponding to wallet account
    // from which to request funds for payment
    table.uuid('accountId').notNullable()
    table.foreign('accountId').references('accounts.id')
    table.integer('destinationAccountScale').notNullable()
    table.string('destinationAccountCode').notNullable()
    table.string('destinationAccountUrl').nullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())

    table.index(['accountId', 'createdAt', 'id'])
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('outgoingPayments')
}
