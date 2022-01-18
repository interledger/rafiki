exports.up = function (knex) {
  return knex.schema.createTable('invoices', function (table) {
    table.uuid('id').notNullable().primary()

    // Open payments account id
    table.uuid('accountId').notNullable()
    table.foreign('accountId').references('accounts.id')
    table.boolean('active').notNullable()
    table.string('description').nullable()
    table.timestamp('expiresAt').notNullable()
    table.bigInteger('amount').notNullable()

    table.timestamp('processAt').nullable()

    table.integer('webhookAttempts').notNullable().defaultTo(0)

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())

    table.index(['accountId', 'createdAt', 'id'])

    table.index('processAt')
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('invoices')
}
