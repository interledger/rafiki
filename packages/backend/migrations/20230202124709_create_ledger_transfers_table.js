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

    table.smallint('ledger').notNullable()
    table.foreign('ledger').references('assets.ledger')

    table.timestamp('expiresAt').nullable()
    table.enu('state', ['PENDING', 'POSTED', 'VOIDED']).notNullable()
    table.enu('type', ['WITHDRAWAL', 'DEPOSIT']).nullable()

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
