exports.up = function (knex) {
  return knex.schema.createTable('accesses', function (table) {
    table.uuid('id').notNullable().primary()
    table.string('type').notNullable()
    table.specificType('actions', 'text[]').notNullable()
    table.string('identifier')
    table.jsonb('limits')
    table.uuid('grantId').notNullable()
    table.foreign('grantId').references('grants.id').onDelete('CASCADE')

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('accesses')
}
