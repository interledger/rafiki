exports.up = function (knex) {
  return knex.schema.createTable('outgoingPayments', function (table) {
    table.uuid('id').notNullable().primary()

    table.string('state').notNullable().index() // PaymentState
    table.string('error').nullable()
    table.integer('stateAttempts').notNullable().defaultTo(0)
    table.boolean('withdrawLiquidity').notNullable().defaultTo(false).index()

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

    table.bigInteger('quoteMinExchangeRateNumerator').nullable()
    table.bigInteger('quoteMinExchangeRateDenominator').nullable()
    table.bigInteger('quoteLowExchangeRateEstimateNumerator').nullable()
    table.bigInteger('quoteLowExchangeRateEstimateDenominator').nullable()
    table.bigInteger('quoteHighExchangeRateEstimateNumerator').nullable()
    table.bigInteger('quoteHighExchangeRateEstimateDenominator').nullable()

    table.uuid('accountId').notNullable()
    table.foreign('accountId').references('accounts.id')

    // Wallet account from which to request funds for payment
    table.uuid('sourceAccountId').notNullable()
    table.integer('destinationAccountScale').notNullable()
    table.string('destinationAccountCode').notNullable()
    table.string('destinationAccountUrl').nullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())

    table.index(['sourceAccountId', 'createdAt', 'id'])
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('outgoingPayments')
}
