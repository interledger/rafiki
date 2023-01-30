exports.up = function (knex) {
  return knex.schema.createTable('quotes', function (table) {
    table.uuid('id').notNullable().primary()

    table.string('receiver').notNullable()
    table.bigInteger('sendAmountValue').notNullable()
    table.bigInteger('receiveAmountValue').notNullable()
    table.string('receiveAmountAssetCode').notNullable()
    table.integer('receiveAmountAssetScale').notNullable()

    table.bigInteger('maxPacketAmount').notNullable()

    table.bigInteger('minExchangeRateNumerator').notNullable()
    table.bigInteger('minExchangeRateDenominator').notNullable()
    table.bigInteger('lowEstimatedExchangeRateNumerator').notNullable()
    table.bigInteger('lowEstimatedExchangeRateDenominator').notNullable()
    table.bigInteger('highEstimatedExchangeRateNumerator').notNullable()
    table.bigInteger('highEstimatedExchangeRateDenominator').notNullable()

    table.timestamp('expiresAt').notNullable()

    // Open Payments payment pointer from which this quote's payment would be sent
    table.uuid('paymentPointerId').notNullable()
    table.foreign('paymentPointerId').references('paymentPointers.id')

    table.uuid('assetId').notNullable()
    table.foreign('assetId').references('assets.id')

    table.string('client').nullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())

    table.index(['paymentPointerId', 'createdAt', 'id'])
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('quotes')
}
