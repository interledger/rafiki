exports.up = function (knex) {
  return knex.schema.alterTable('accounts', function (table) {
    table.dropColumn('scale')
    table.dropColumn('currency')

    table.boolean('disabled').notNullable().defaultTo(false)

    table.uuid('assetId').notNullable()
    table.foreign('assetId').references('assets.id')

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

    table.index('superAccountId')
    table.foreign('superAccountId').references('accounts.id')

    table.bigInteger('maxPacketAmount').nullable()

    table.string('outgoingToken').nullable()
    table.string('outgoingEndpoint').nullable()

    table.boolean('streamEnabled').notNullable().defaultTo(false)

    table.string('staticIlpAddress').nullable()
  })
}

exports.down = function (knex) {
  return knex.schema.alterTable('accounts', function (table) {
    table.integer('scale').notNullable()
    table.string('currency').notNullable()

    table.dropColumn('disabled')
    table.dropColumn('assetId')
    table.dropColumn('balanceId')
    table.dropColumn('creditBalanceId')
    table.dropColumn('creditExtendedBalanceId')
    table.dropColumn('debtBalanceId')
    table.dropColumn('lentBalanceId')
    table.dropIndex('superAccountId')
    table.dropColumn('maxPacketAmount')
    table.dropColumn('outgoingToken')
    table.dropColumn('outgoingEndpoint')
    table.dropColumn('streamEnabled')
    table.dropColumn('staticIlpAddress')
  })
}
