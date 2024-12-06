/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('tenants', function (table) {
    table.uuid('id').notNullable().primary()
    table.string('email')
    table.string('apiSecret').notNullable()
    table.string('idpConsentUrl')
    table.string('idpSecret')
    table.string('publicName')

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
    table.timestamp('deletedAt')
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('tenants')
}
