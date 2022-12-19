exports.up = function (knex) {
  return knex.schema.createTable('paymentPointerKeys', function (table) {
    table.uuid('id').notNullable().primary()
    table.uuid('paymentPointerId').notNullable()
    table.foreign('paymentPointerId').references('paymentPointers.id')
    table.string('kid').notNullable()
    table.string('x').notNullable()
    table.boolean('revoked').notNullable().defaultTo(false)

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('paymentPointerKeys')
}
