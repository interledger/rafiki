exports.up = function (knex) {
  return knex.schema.createTable('resourceSets', function (table) {
    table.uuid('id').notNullable().primary()
    table.string('keyProof')
    table.jsonb('keyJwk')

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('resourceSets')
}
