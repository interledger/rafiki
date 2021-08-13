exports.up = function (knex) {
  return knex.schema.createTable('ilpAccounts', function (table) {
    table.uuid('id').notNullable().primary()

    table.boolean('disabled').notNullable().defaultTo(false)

    table.string('assetCode').notNullable()
    table.integer('assetScale').notNullable()

    // TigerBeetle account id tracking Interledger balance
    table.uuid('balanceId').notNullable()
    // TigerBeetle account id tracking credit extended by super-account
    table.uuid('creditBalanceId').nullable()
    // TigerBeetle account id tracking credit extended to sub-account(s)
    table.uuid('creditExtendedBalanceId').nullable()
    // TigerBeetle account id tracking amount loaned from super-account
    table.uuid('debtBalanceId').nullable()
    // TigerBeetle account id tracking amount(s) loaned to sub-account(s)
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
