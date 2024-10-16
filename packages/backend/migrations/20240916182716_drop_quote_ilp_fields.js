/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('quotes', function (table) {
    table.dropColumn('maxPacketAmount')
    table.dropColumn('minExchangeRateNumerator')
    table.dropColumn('minExchangeRateDenominator')
    table.dropColumn('lowEstimatedExchangeRateNumerator')
    table.dropColumn('lowEstimatedExchangeRateDenominator')
    table.dropColumn('highEstimatedExchangeRateNumerator')
    table.dropColumn('highEstimatedExchangeRateDenominator')
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema
    .alterTable('quotes', function (table) {
      // restore columns without not null constraint
      table.bigInteger('maxPacketAmount')
      table.decimal('minExchangeRateNumerator', 64, 0)
      table.decimal('minExchangeRateDenominator', 64, 0)
      table.decimal('lowEstimatedExchangeRateNumerator', 64, 0)
      table.decimal('lowEstimatedExchangeRateDenominator', 64, 0)
      table.decimal('highEstimatedExchangeRateNumerator', 64, 0)
      table.decimal('highEstimatedExchangeRateDenominator', 64, 0)
    })
    .then(() => {
      // Migrate data back to quotes table from ilpQuote
      return knex.raw(`
        UPDATE "quotes"
        SET 
          "maxPacketAmount" = "ilpQuoteDetails"."maxPacketAmount",
          "minExchangeRateNumerator" = "ilpQuoteDetails"."minExchangeRateNumerator",
          "minExchangeRateDenominator" = "ilpQuoteDetails"."minExchangeRateDenominator",
          "lowEstimatedExchangeRateNumerator" = "ilpQuoteDetails"."lowEstimatedExchangeRateNumerator",
          "lowEstimatedExchangeRateDenominator" = "ilpQuoteDetails"."lowEstimatedExchangeRateDenominator",
          "highEstimatedExchangeRateNumerator" = "ilpQuoteDetails"."highEstimatedExchangeRateNumerator",
          "highEstimatedExchangeRateDenominator" = "ilpQuoteDetails"."highEstimatedExchangeRateDenominator"
        FROM "ilpQuoteDetails"
        WHERE "quotes"."id" = "ilpQuoteDetails"."quoteId"
      `)
    })
}
