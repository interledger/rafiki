/**
 * Optimizes the worker "get next due item" scans.
 *
 * - webhooks: the delivery worker only scans rows with a non-null processAt
 *   (null = delivered / terminal). A partial index over those rows is much
 *   smaller and hotter than the full processAt index and directly serves the
 *   `processAt <= now ORDER BY processAt` claim query.
 * - outgoingPayments: the lifecycle worker only scans rows in the SENDING
 *   state (a small fraction of the table). A partial index on that subset,
 *   keyed by updatedAt, serves the state + retry-backoff claim query without
 *   scanning the full table.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Replace the full processAt index with a partial one over pending webhooks.
  await knex.schema.alterTable('webhooks', (table) => {
    table.dropIndex('processAt')
  })
  await knex.raw(
    'CREATE INDEX webhooks_processat_pending_index ON "webhooks" ("processAt") WHERE "processAt" IS NOT NULL'
  )

  await knex.raw(
    `CREATE INDEX outgoingpayments_pending_index ON "outgoingPayments" ("updatedAt") WHERE state = 'SENDING'`
  )
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.raw('DROP INDEX IF EXISTS outgoingpayments_pending_index')
  await knex.raw('DROP INDEX IF EXISTS webhooks_processat_pending_index')
  await knex.schema.alterTable('webhooks', (table) => {
    table.index('processAt')
  })
}
