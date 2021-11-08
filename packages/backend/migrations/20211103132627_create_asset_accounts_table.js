exports.up = function (knex) {
  return knex.schema.createTable('assetAccounts', function (table) {
    table.uuid('id').notNullable().primary()
    table.foreign('id').references('assets.id')

    // Account id tracking liquidity balance
    table.uuid('liquidityAccountId').notNullable()
    table.foreign('liquidityAccountId').references('accounts.id')

    // Account id tracking settlement balance
    table.uuid('settlementAccountId').notNullable()
    table.foreign('settlementAccountId').references('accounts.id')

    // Account id tracking outgoing payments total sent amount
    table.uuid('sentAccountId').notNullable()
    table.foreign('sentAccountId').references('accounts.id')

    // Account id tracking cumulative invoice receive limit
    table.uuid('receiveLimitAccountId').notNullable()
    table.foreign('receiveLimitAccountId').references('accounts.id')

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('assetAccounts')
}
