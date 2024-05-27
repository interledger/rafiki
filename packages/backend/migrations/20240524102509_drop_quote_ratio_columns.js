/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('quotes', (table) => {
    table.string('minExchangeRateNumerator').alter()
    table.string('minExchangeRateDenominator').alter()
    table.string('lowEstimatedExchangeRateNumerator').alter()
    table.string('lowEstimatedExchangeRateDenominator').alter()
    table.string('highEstimatedExchangeRateNumerator').alter()
    table.string('highEstimatedExchangeRateDenominator').alter()

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
