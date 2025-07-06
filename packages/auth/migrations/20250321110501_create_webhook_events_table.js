exports.up = function (knex) {
  return knex.schema.createTable('webhookEvents', function (table) {
    table.uuid('id').notNullable().primary()

    table.string('type').notNullable()
    table.json('data').notNullable()
    table.integer('attempts').notNullable().defaultTo(0)
    table.integer('statusCode').nullable()

    table
      .uuid('grantId')
      .nullable()
      .references('grants.id')
      .index()
      .onDelete('CASCADE')

    table.timestamp('processAt').nullable().defaultTo(knex.fn.now())

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())

    table.index('processAt')
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('webhookEvents')
}
