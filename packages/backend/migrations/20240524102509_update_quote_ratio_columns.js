/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('quotes', (table) => {
    table.decimal('minExchangeRateNumerator', 64, 0).alter()
    table.decimal('minExchangeRateDenominator', 64, 0).alter()
    table.decimal('lowEstimatedExchangeRateNumerator', 64, 0).alter()
    table.decimal('lowEstimatedExchangeRateDenominator', 64, 0).alter()
    table.decimal('highEstimatedExchangeRateNumerator', 64, 0).alter()
    table.decimal('highEstimatedExchangeRateDenominator', 64, 0).alter()

    table.dropColumn('additionalFields')
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('quotes', (table) => {
    table.bigInteger('minExchangeRateNumerator').alter()
    table.bigInteger('minExchangeRateDenominator').alter()
    table.bigInteger('lowEstimatedExchangeRateNumerator').alter()
    table.bigInteger('lowEstimatedExchangeRateDenominator').alter()
    table.bigInteger('highEstimatedExchangeRateNumerator').alter()
    table.bigInteger('highEstimatedExchangeRateDenominator').alter()

    table.json('additionalFields').nullable()
  })
}
