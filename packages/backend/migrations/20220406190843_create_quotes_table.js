exports.up = function (knex) {
  return knex.schema.createTable('quotes', function (table) {
    table.uuid('id').notNullable().primary()

    table.string('receivingPayment').notNullable()
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

    table.boolean('completeReceivingPayment').notNullable().defaultTo(false)

    // Open Payments account from which this quote's payment would be sent
    table.uuid('accountId').notNullable()
    table.foreign('accountId').references('accounts.id')

    table.uuid('assetId').notNullable()
    table.foreign('assetId').references('assets.id')

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())

    table.index(['accountId', 'createdAt', 'id'])
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('quotes')
}
