exports.up = function (knex) {
  return knex.schema.createTable('limits', function (table) {
    table.uuid('id').notNullable().primary()
    table.jsonb('data').notNullable()
    table.string('createdById')
    table.string('accessToken')
    table.foreign('accessToken').references('accessTokens.value')
    table.uuid('grantId').notNullable()
    table.foreign('grantId').references('grants.id').onDelete('CASCADE')
    table.string('description')
    table.string('externalRef')

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('limits')
}
