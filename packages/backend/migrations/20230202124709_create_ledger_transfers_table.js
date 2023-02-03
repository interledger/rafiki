/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('ledgerTransfers', function (table) {
    table.uuid('id').notNullable().primary()
    table.uuid('transferRef').notNullable().unique().index()

    table.uuid('debitAccountId').notNullable()
    table.foreign('debitAccountId').references('ledgerAccounts.id')
    table.uuid('creditAccountId').notNullable()
    table.foreign('creditAccountId').references('ledgerAccounts.id')

    table.bigInteger('amount').notNullable().checkPositive()

    table.uuid('assetId').notNullable()
    table.foreign('assetId').references('assets.id')

    table.enu('state', ['PENDING', 'POSTED', 'VOIDED', 'EXPIRED']).notNullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('ledgerTransfers')
}
