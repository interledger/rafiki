/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable(
    'outgoingPaymentCardDetails',
    function (table) {
      table.uuid('id').notNullable().primary()
      table.string('signature').notNullable()
      table.string('expiry').notNullable()
      table.uuid('outgoingPaymentId').notNullable()

      table
        .foreign('outgoingPaymentId')
        .references('id')
        .inTable('outgoingPayments')
        .onDelete('CASCADE')

      table.timestamp('createdAt').defaultTo(knex.fn.now())
      table.timestamp('updatedAt').defaultTo(knex.fn.now())
    }
  )
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('outgoingPaymentCardDetails')
}
