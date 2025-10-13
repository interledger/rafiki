/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .alterTable('incomingPayments', function (table) {
      table.enum('initiatedBy', ['CARD', 'OPEN_PAYMENTS', 'ADMIN'])
    })
    .then(() => {
      return Promise.all([
        knex.raw(
          `UPDATE "incomingPayments" SET "initiatedBy" = 'OPEN_PAYMENTS' WHERE "client" IS NOT NULL`
        ),
        knex.raw(
          `UPDATE "incomingPayments" SET "initiatedBy" = 'ADMIN' WHERE "client" IS NULL`
        )
      ])
    })
    .then(() => {
      return knex.raw(
        `ALTER TABLE "incomingPayments" ALTER COLUMN "initiatedBy" SET NOT NULL`
      )
    })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('incomingPayments', function (table) {
    table.dropColumn('initiatedBy')
  })
}
