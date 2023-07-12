/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return Promise.all([
    knex.schema.alterTable('incomingPayments', function (table) {
      table.dropColumn('externalRef')
      table.dropColumn('description')
      table.jsonb('metadata').nullable()
    }),
    knex.schema.alterTable('outgoingPayments', function (table) {
      table.dropColumn('externalRef')
      table.dropColumn('description')
      table.jsonb('metadata').nullable()
    })
  ])
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return Promise.all([
    knex.schema.alterTable('incomingPayments', function (table) {
      table.dropColumn('metadata')
      table.string('description').nullable()
      table.string('externalRef').nullable()
    }),
    knex.schema.alterTable('outgoingPayments', function (table) {
      table.dropColumn('metadata')
      table.string('description').nullable()
      table.string('externalRef').nullable()
    })
  ])
}
