exports.up = function (knex) {
  return knex.schema.table('accounts', function (table) {
    table.uuid('parentAccountId').nullable()
  })
}

exports.down = function (knex) {
  return knex.schema.table('accounts', function (table) {
    table.dropColumn('parentAccountId')
  })
}
