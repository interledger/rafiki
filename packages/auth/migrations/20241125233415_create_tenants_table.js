/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('tenants', function (table) {
    table.uuid('id').notNullable().primary()
    table.string('idpConsentUrl').notNullable()
    table.string('idpSecret').notNullable()

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
