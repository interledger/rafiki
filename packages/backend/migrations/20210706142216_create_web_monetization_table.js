exports.up = function (knex) {
  return knex.schema.createTable('webMonetization', function (table) {
    table.uuid('accountId').notNullable().primary()
    table.uuid('currentInvoiceId').nullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('webMonetization')
}
