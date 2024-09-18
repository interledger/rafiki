/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

exports.up = function (knex) {
  return knex("quotes")
    .whereNull("estimatedExchangeRate")
    .update({
      // TODO: vet this more... looks like the low* fields were (inadvertently?)
      // made nullable when updating from bigint to decimal. If they are null
      // anywhere then this wont work.
      estimatedExchangeRate: knex.raw("?? / ??", [
        "lowEstimatedExchangeRateNumerator",
        "lowEstimatedExchangeRateDenominator",
      ]),
    })
    .then(() => {
      return knex.schema.table("quotes", (table) => {
        table.decimal("estimatedExchangeRate", 20, 10).notNullable().alter();
      });
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.table("quotes", (table) => {
    table.decimal("estimatedExchangeRate", 20, 10).nullable().alter();
  });
};
