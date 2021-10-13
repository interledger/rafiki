exports.up = function (knex) {
  return knex.schema.createTable('accounts', function (table) {
    table.uuid('id').notNullable().primary()

    table.boolean('disabled').notNullable().defaultTo(false)

    table.uuid('assetId').notNullable()
    table.foreign('assetId').references('assets.id')

    // TigerBeetle account id tracking Interledger balance
    table.uuid('balanceId').notNullable()

    table.bigInteger('maxPacketAmount').nullable()

    table.string('outgoingToken').nullable()
    table.string('outgoingEndpoint').nullable()

    table.boolean('streamEnabled').notNullable().defaultTo(false)

    table.string('staticIlpAddress').nullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('accounts')
}
