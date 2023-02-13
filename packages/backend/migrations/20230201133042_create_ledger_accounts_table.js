/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('ledgerAccounts', function (table) {
    table.uuid('id').notNullable().primary()
    table.uuid('accountRef').notNullable().index()

    table.smallint('ledger').notNullable()
    table.foreign('ledger').references('assets.ledger')

    table
      .enu('type', [
        'LIQUIDITY_ASSET',
        'LIQUIDITY_PEER',
        'LIQUIDITY_INCOMING',
        'LIQUIDITY_OUTGOING',
        'LIQUIDITY_WEB_MONETIZATION',
        'SETTLEMENT'
      ])
      .notNullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())

    table.unique(['accountRef', 'type'])
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('ledgerAccounts')
}
