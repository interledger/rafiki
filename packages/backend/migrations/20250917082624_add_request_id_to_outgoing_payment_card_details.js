/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn(
    'outgoingPaymentCardDetails',
    'requestId'
  )
  if (!hasColumn) {
    await knex.schema.alterTable(
      'outgoingPaymentCardDetails',
      function (table) {
        table.string('requestId').nullable()
      }
    )
  }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn(
    'outgoingPaymentCardDetails',
    'requestId'
  )
  if (hasColumn) {
    await knex.schema.alterTable(
      'outgoingPaymentCardDetails',
      function (table) {
        table.dropColumn('requestId')
      }
    )
  }
}
