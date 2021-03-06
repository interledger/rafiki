exports.up = function (knex) {
  return knex.schema.createTable('accessTokens', function (table) {
    table.uuid('id').notNullable().primary()
    table.string('value').notNullable().unique()
    table.string('managementId').notNullable()
    table.integer('expiresIn')
    table.uuid('grantId').notNullable()
    table.foreign('grantId').references('grants.id').onDelete('CASCADE')

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('accessTokens')
}
