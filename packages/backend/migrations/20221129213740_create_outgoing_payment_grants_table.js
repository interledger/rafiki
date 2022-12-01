exports.up = function (knex) {
  return knex.schema.createTable('outgoingPaymentGrants', function (table) {
    table.string('id').notNullable().primary()
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('outgoingPaymentGrants')
}
