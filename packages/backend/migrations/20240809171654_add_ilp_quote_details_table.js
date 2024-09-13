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
        // Enable uuid_generate_v4
        return knex.raw(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`)
      })
      .then(() => {
        // Migrate data from quotes to ilpQuoteDetails.
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
      .then(() => {
        // TODO: test this more thoroughly.
        // Might need to seed in migration preceeding this?
        // Cant simply withold htis migration. Application code will fail when trying
        // to insert ...
        return knex('quotes')
          .whereNull('estimatedExchangeRate')
          .update({
            estimatedExchangeRate: knex.raw('?? / ??', [
              'lowEstimatedExchangeRateNumerator',
              'lowEstimatedExchangeRateDenominator'
            ])
          })
      })
      .then(() => {
        return knex.schema.alterTable('quotes', function (table) {
          table.dropColumn('maxPacketAmount')
          table.dropColumn('minExchangeRateNumerator')
          table.dropColumn('minExchangeRateDenominator')
          table.dropColumn('lowEstimatedExchangeRateNumerator')
          table.dropColumn('lowEstimatedExchangeRateDenominator')
          table.dropColumn('highEstimatedExchangeRateNumerator')
          table.dropColumn('highEstimatedExchangeRateDenominator')
          table.bigInteger('sourceAmount').nullable()
        })
      })
  )
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
    .then(() => {
      // Apply the not null constraints after data insertion
      return knex.schema.alterTable('quotes', function (table) {
        table.bigInteger('maxPacketAmount').notNullable().alter()
        table.decimal('minExchangeRateNumerator', 64, 0).notNullable().alter()
        table.decimal('minExchangeRateDenominator', 64, 0).notNullable().alter()
        table
          .decimal('lowEstimatedExchangeRateNumerator', 64, 0)
          .notNullable()
          .alter()
        table
          .decimal('lowEstimatedExchangeRateDenominator', 64, 0)
          .notNullable()
          .alter()
        table
          .decimal('highEstimatedExchangeRateNumerator', 64, 0)
          .notNullable()
          .alter()
        table
          .decimal('highEstimatedExchangeRateDenominator', 64, 0)
          .notNullable()
          .alter()
      })
    })
    .then(() => {
      return knex.schema.dropTableIfExists('ilpQuoteDetails')
    })
}
