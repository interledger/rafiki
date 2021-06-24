exports.up = function (knex) {
  return knex.schema.createTable('invoices', function (table) {
    table.uuid('id').notNullable().primary()
    table.uuid('userId').notNullable()
    table.uuid('accountId').notNullable()
    table.boolean('active').notNullable()
    table.string('description').nullable()
    table.timestamp('expiresAt').nullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('invoices')
}
