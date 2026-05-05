/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('outgoingPaymentGrantSpentAmounts', function (table) {
      table.uuid('id').notNullable().primary()
      table.string('grantId').notNullable()
      table.foreign('grantId').references('outgoingPaymentGrants.id')
      table.uuid('outgoingPaymentId').notNullable()
      table.foreign('outgoingPaymentId').references('outgoingPayments.id')
      table.integer('receiveAmountScale').notNullable()
      table.string('receiveAmountCode').notNullable()
      table.bigInteger('paymentReceiveAmountValue').notNullable()
      table.bigInteger('intervalReceiveAmountValue').nullable()
      table.bigInteger('grantTotalReceiveAmountValue').notNullable()
      table.integer('debitAmountScale').notNullable()
      table.string('debitAmountCode').notNullable()
      table.bigInteger('paymentDebitAmountValue').notNullable()
      table.bigInteger('intervalDebitAmountValue').nullable()
      table.bigInteger('grantTotalDebitAmountValue').notNullable()
      table.string('paymentState').notNullable()
      table.timestamp('intervalStart').nullable()
      table.timestamp('intervalEnd').nullable()
      table.timestamp('createdAt').defaultTo(knex.fn.now())
    })
    .then(() => {
      return knex.raw(
        'CREATE INDEX outgoingPaymentGrantSpentAmounts_grantId_createdAt_desc_idx ON "outgoingPaymentGrantSpentAmounts" ("grantId", "createdAt" DESC)'
      )
    })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('outgoingPaymentGrantSpentAmounts')
}
