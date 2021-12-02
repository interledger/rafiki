exports.up = function (knex) {
  return knex.schema.createTable('apiKeys', function (table) {
    table.uuid('id').notNullable().primary()
    table.string('hashedKey').notNullable().unique().index()
    table.uuid('accountId').notNullable().index()
    table.foreign('accountId').references('accounts.id').onDelete('CASCADE')

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('apiKeys')
}
