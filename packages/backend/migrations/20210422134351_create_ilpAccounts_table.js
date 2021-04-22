exports.up = function (knex) {
  return knex.schema.createTable('ilpAccounts', function (table) {
    table.uuid('id').notNullable().primary()

    table.boolean('disabled').defaultTo(false)

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('ilpAccounts')
}
