exports.up = function (knex) {
  return knex.schema.createTable('mandates', function (table) {
    table.uuid('id').notNullable().primary()

    // Open payments account id
    table.uuid('accountId').notNullable()
    table.foreign('accountId').references('accounts.id')
    table.bigInteger('amount').notNullable()
    table.string('assetCode').notNullable()
    table.integer('assetScale').notNullable()
    table.timestamp('startAt').nullable()
    table.timestamp('expiresAt').nullable()
    table.string('interval').nullable()
    table.bigInteger('balance').notNullable()
    table.boolean('revoked').notNullable()
    table.timestamp('processAt').nullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())

    table.index(['accountId', 'createdAt', 'id'])

    table.index('processAt')
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('mandates')
}
