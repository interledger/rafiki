exports.up = function (knex) {
  return knex.schema.alterTable('accessTokens', function (table) {
    table.boolean('revoked').nullable()
  })
}

exports.down = function (knex) {
  return knex.schema.alterTable('accessTokens', function (table) {
    table.dropColumn('revoked')
  })
}
