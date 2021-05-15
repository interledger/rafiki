exports.up = function (knex) {
  return knex.schema.createTable('ilpAccountSettings', function (table) {
    table.uuid('id').notNullable().primary()

    table.boolean('disabled').defaultTo(false)

    table.string('assetCode').notNullable()
    table.integer('assetScale').notNullable()

    table.uuid('balanceId').notNullable()
    table.uuid('debtBalanceId').notNullable()
    table.uuid('trustlineBalanceId').notNullable()
    table.uuid('parentAccountId').nullable()

    table
      .specificType('incomingTokens', 'TEXT []')
      .nullable()
      .index(null, 'GIN')
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
  return knex.schema.dropTableIfExists('ilpAccountSettings')
}
