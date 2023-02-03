/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('ledgerAccounts', function (table) {
    table.uuid('id').notNullable().primary()
    table.uuid('accountRef').notNullable().unique().index()

    table.uuid('assetId').notNullable()
    table.foreign('assetId').references('assets.id')

    table
      .enu('type', [
        'LIQUIDITY',
        'LIQUIDITY_ASSET',
        'LIQUIDITY_PEER',
        'LIQUIDITY_INCOMING',
        'LIQUIDITY_OUTGOING',
        'SETTLEMENT'
      ])
      .notNullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('ledgerAccounts')
}
