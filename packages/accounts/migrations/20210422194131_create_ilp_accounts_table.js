exports.up = function (knex) {
  return knex.schema.createTable('ilpAccounts', function (table) {
    table.uuid('id').notNullable().primary()

    table.boolean('disabled').notNullable().defaultTo(false)

    table.string('assetCode').notNullable()
    table.integer('assetScale').notNullable()

    table.uuid('balanceId').notNullable()
    table.uuid('trustlineBalanceId').nullable()
    table.uuid('creditExtendedBalanceId').nullable()
    table.uuid('borrowedBalanceId').nullable()
    table.uuid('lentBalanceId').nullable()

    table.uuid('superAccountId').nullable().index()
    table.foreign('superAccountId').references('ilpAccounts.id')

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
  return knex.schema.dropTableIfExists('ilpAccounts')
}
