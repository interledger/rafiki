exports.up = function (knex) {
  return knex.schema.table('users', function (table) {
    table.uuid('accountId').notNullable().unique()
  })
}

exports.down = function (knex) {
  return knex.schema.table('users', function (table) {
    table.dropColumn('accountId')
  })
}
