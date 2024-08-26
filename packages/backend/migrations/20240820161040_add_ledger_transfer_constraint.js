/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.table('ledgerTransfers', function (table) {
    table.check(
      `("state" != 'PENDING') OR ("expiresAt" IS NOT NULL)`,
      null,
      'check_pending_requires_expires_at'
    )
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.table('ledgerTransfers', function (table) {
    table.dropChecks(['check_pending_requires_expires_at'])
  })
}
