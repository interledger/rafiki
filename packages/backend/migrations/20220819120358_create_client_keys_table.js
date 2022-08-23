exports.up = function (knex) {
  return knex.schema.createTable('clientKeys', function (table) {
    table.uuid('id').notNullable().primary()
    table.uuid('clientId').notNullable()
    table.foreign('clientId').references('clients.id')
    table.jsonb('jwk').notNullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('clientKeys')
}
