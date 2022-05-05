exports.up = function (knex) {
  return knex.schema.createTable('limits', function (table) {
    table.uuid('id').notNullable().primary()
    table.string('name')
    table.bigInteger('value')
    table.string('assetCode')
    table.integer('assetScale')
    table.string('createdById')
    table.string('accessToken').notNullable()
    table
      .foreign('accessToken')
      .references('accessTokens.value')
      .onDelete('CASCADE')

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('limits')
}
