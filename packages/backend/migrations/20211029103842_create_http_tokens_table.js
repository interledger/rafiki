exports.up = function (knex) {
  return knex.schema.createTable('httpTokens', function (table) {
    table.uuid('id').notNullable().primary()
    table.string('token').notNullable().unique().index()
    table.uuid('peerId').notNullable().index()
    table.foreign('peerId').references('peers.id').onDelete('CASCADE')

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('httpTokens')
}
