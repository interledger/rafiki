exports.up = function (knex) {
  return knex.schema.createTable('accessTokens', function (table) {
    table.uuid('id').notNullable().primary()
    table.string('value').notNullable().unique()
    table.string('managementId').notNullable()
    table.integer('expiresIn')
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('accessTokens')
}
