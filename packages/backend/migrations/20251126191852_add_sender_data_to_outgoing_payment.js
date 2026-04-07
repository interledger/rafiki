/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn(
    'outgoingPayments',
    'dataToTransmit'
  )
  if (!hasColumn) {
    await knex.schema.alterTable('outgoingPayments', function (table) {
      table.string('dataToTransmit').nullable()
    })
  }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn(
    'outgoingPayments',
    'dataToTransmit'
  )
  if (hasColumn) {
    await knex.schema.alterTable('outgoingPayments', function (table) {
      table.dropColumn('dataToTransmit')
    })
  }
}
