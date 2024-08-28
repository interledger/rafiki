/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('tenantEndpoints', function (table) {
    table.uuid('tenantId').notNullable()
    table.enum('type', ['WebhookBaseUrl', 'RatesEndpoint'])

    table.string('value').notNullable()

    table.foreign('tenantId').references('id').inTable('tenants')

    table.primary(['id', 'type'])
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable('tenantEndpoints')
}
