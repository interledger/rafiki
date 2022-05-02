exports.up = function (knex) {
  return knex.schema.createTable('dummyTables', function (table) {
    table.uuid('id').notNullable().primary()
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('dummyTables')
}
