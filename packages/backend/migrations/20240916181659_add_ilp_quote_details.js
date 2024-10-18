/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return (
    knex.schema
      // Create new table with columns from "quotes" to migrate
      .createTable('ilpQuoteDetails', function (table) {
        table.uuid('id').notNullable().primary()
        table.uuid('quoteId').notNullable().unique()
        table.foreign('quoteId').references('quotes.id')

        table.bigInteger('maxPacketAmount').notNullable()
        table.decimal('minExchangeRateNumerator', 64, 0).notNullable()
        table.decimal('minExchangeRateDenominator', 64, 0).notNullable()
        table.decimal('lowEstimatedExchangeRateNumerator', 64, 0).notNullable()
        table
          .decimal('lowEstimatedExchangeRateDenominator', 64, 0)
          .notNullable()
        table.decimal('highEstimatedExchangeRateNumerator', 64, 0).notNullable()
        table
          .decimal('highEstimatedExchangeRateDenominator', 64, 0)
          .notNullable()

        table.timestamp('createdAt').defaultTo(knex.fn.now())
        table.timestamp('updatedAt').defaultTo(knex.fn.now())
      })
      .then(() => {
        return knex.raw(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)
      })
      .then(() => {
        return knex.raw(`
          INSERT INTO "ilpQuoteDetails" (
            id,
            "quoteId",
            "maxPacketAmount",
            "minExchangeRateNumerator",
            "minExchangeRateDenominator",
            "lowEstimatedExchangeRateNumerator",
            "lowEstimatedExchangeRateDenominator",
            "highEstimatedExchangeRateNumerator",
            "highEstimatedExchangeRateDenominator"
          )
          SELECT
            uuid_generate_v4(),
            id AS "quoteId",
            "maxPacketAmount",
            "minExchangeRateNumerator",
            "minExchangeRateDenominator",
            "lowEstimatedExchangeRateNumerator",
            "lowEstimatedExchangeRateDenominator",
            "highEstimatedExchangeRateNumerator",
            "highEstimatedExchangeRateDenominator"
          FROM "quotes";
        `)
      })
  )
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.raw(`DROP EXTENSION IF EXISTS "uuid-ossp"`).then(() => {
    return knex.schema.dropTableIfExists('ilpQuoteDetails')
  })
}
