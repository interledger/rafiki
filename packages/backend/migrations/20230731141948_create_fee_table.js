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
    table.bigInteger('fixedFee').notNullable()
    table.check('"fixedFee" >= 0', undefined, 'fees_fixedfee_check')
    table
      .integer('basisPointFee')
      .notNullable()
      .checkBetween([0, 10_000], 'fees_basispointfee_check')
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('fees')
}
