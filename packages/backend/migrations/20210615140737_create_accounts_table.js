exports.up = function (knex) {
  return knex.schema.createTable('accounts', function (table) {
    table.uuid('id').notNullable().primary()
    table.integer('scale').notNullable()
    table.string('currency').notNullable()
    table.uuid('parentAccountId').nullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('accounts')
}
