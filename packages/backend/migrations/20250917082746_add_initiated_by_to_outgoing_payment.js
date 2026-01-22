/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .alterTable('outgoingPayments', function (table) {
      table.enum('initiatedBy', ['CARD', 'OPEN_PAYMENTS', 'ADMIN'])
    })
    .then(() => {
      return Promise.all([
        knex.raw(
          `UPDATE "outgoingPayments" SET "initiatedBy" = 'OPEN_PAYMENTS' WHERE "grantId" IS NOT NULL`
        ),
        knex.raw(
          `UPDATE "outgoingPayments" SET "initiatedBy" = 'ADMIN' WHERE "grantId" IS NULL`
        )
      ])
    })
    .then(() => {
      return knex.raw(
        `ALTER TABLE "outgoingPayments" ALTER COLUMN "initiatedBy" SET NOT NULL`
      )
    })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('outgoingPayments', function (table) {
    table.dropColumn('initiatedBy')
  })
}
