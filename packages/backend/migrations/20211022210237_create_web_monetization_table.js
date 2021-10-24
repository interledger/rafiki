exports.up = function (knex) {
  return knex.schema.createTable('webMonetization', function (table) {
    table.uuid('id').notNullable().primary()
    table.foreign('id').references('paymentPointers.id')
    table.uuid('invoiceId').nullable()
    table.foreign('invoiceId').references('invoices.id')

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('webMonetization')
}
