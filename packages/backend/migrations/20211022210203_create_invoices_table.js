exports.up = function (knex) {
  return knex.schema.createTable('invoices', function (table) {
    table.uuid('id').notNullable().primary()
    table.uuid('accountId').notNullable()
    table.foreign('accountId').references('accounts.id')
    table.uuid('paymentPointerId').notNullable()
    table.foreign('paymentPointerId').references('paymentPointers.id')
    table.boolean('active').notNullable()
    table.string('description').nullable()
    table.timestamp('expiresAt').nullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())

    table.index(['accountId', 'createdAt', 'id'])
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('invoices')
}
