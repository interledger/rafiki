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

    table.string('webhookId').nullable()
    table.integer('webhookAttempts').notNullable().defaultTo(0)

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())

    table.index(['accountId', 'createdAt', 'id'])

    table.index('expiresAt')
    /*
    TODO: The latest version of knex supports "partial indexes", which would be more efficient for the processInvoice use case. Unfortunately, the only version of 'objection' that supports this version of knex is still in alpha.

    // This is a 'partial index' -- expiresAt is only indexed when active=true.
    table.index('expiresAt', 'idx_active_expiresAt', {
      // Knex partial indices are a very new feature in Knex and appear to be buggy.
      //
      // Use a 'raw' condition because "knex.where('active',true)" fails with:
      // > migration failed with error: create index "idx_active_expiresAt" on "invoices" ("expiresAt") where "active" = $1 - there is no parameter $1
      predicate: knex.whereRaw('active = TRUE')
    })
    */
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('invoices')
}
