exports.up = function (knex) {
  return knex.schema.createTable('clients', function (table) {
    table.uuid('id').notNullable().primary()
    table.string('name').notNullable()
    table.string('uri').notNullable()
    table.string('email').notNullable()
    table.string('image').notNullable()

    table.string('paymentPointerUrl').notNullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('clients')
}
