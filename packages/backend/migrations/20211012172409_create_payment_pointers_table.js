exports.up = function (knex) {
  return knex.schema.createTable('paymentPointers', function (table) {
    table.uuid('id').notNullable().primary()
    table.string('url').notNullable().unique().index()
    table.uuid('assetId').notNullable()
    table.foreign('assetId').references('assets.id')

    table.string('publicName').nullable()

    // The cumulative received amount tracked by
    // `payment_pointer.web_monetization` webhook events.
    // The value should be equivalent to the following query:
    // select sum(`withdrawalAmount`) from `webhookEvents` where `withdrawalAccountId` = `account.id`
    table.bigInteger('totalEventsAmount').notNullable().defaultTo(0)
    table.timestamp('processAt').nullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())

    table.index('processAt')
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('paymentPointers')
}
