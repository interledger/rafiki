exports.up = function (knex) {
  return knex.schema.createTable('peers', function (table) {
    table.uuid('id').notNullable().primary()

    // Tigerbeetle account id
    table.uuid('tbAccountId').notNullable().index()

    table.uuid('assetId').notNullable()
    table.foreign('assetId').references('assets.id')

    table.bigInteger('maxPacketAmount').nullable()

    table.string('staticIlpAddress').notNullable().index()

    table.string('outgoingToken').nullable()
    table.string('outgoingEndpoint').nullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())

    table.index(['createdAt', 'id'])
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('peers')
}
