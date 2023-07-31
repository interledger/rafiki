/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('fees', function (table) {
    table.uuid('id').primary()
    table.uuid('assetId').references('assets.id').notNullable()
    table.enum('type', ['SENDING', 'RECEIVING']).notNullable()
    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.bigInteger('fixedFee')
    table.bigInteger('percentageFee')
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('fees')
}
