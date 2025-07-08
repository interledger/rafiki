/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('posDevices', function (table) {
    table.uuid('id').notNullable().primary()
    table
      .uuid('merchantId')
      .notNullable()
      .references('merchants.id')
      .onDelete('CASCADE')
      .index()

    table.uuid('walletAddressId').notNullable()

    table.string('deviceName').notNullable()
    table.string('publicKey')
    table.string('keyId')
    table.string('algorithm')

    table.string('status').notNullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('deletedAt')
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('posDevices')
}
