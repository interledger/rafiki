exports.up = function (knex) {
  return knex.schema.createTable('accounts', function (table) {
    table.uuid('id').notNullable().primary()

    table.boolean('disabled').defaultTo(false)

    table.string('assetCode').notNullable()
    table.integer('assetScale').notNullable()

    table.uuid('balanceId').notNullable()
    table.uuid('debtBalanceId').notNullable()
    table.uuid('trustlineBalanceId').notNullable()
    table.uuid('parentAccountId').nullable()

    table.bigInteger('maxPacketAmount').notNullable()

    table.string('incomingEndpoint').nullable()
    table.string('outgoingToken').nullable()
    table.string('outgoingEndpoint').nullable()

    table.boolean('streamEnabled').nullable()

    table.string('staticIlpAddress').nullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('accounts')
}
