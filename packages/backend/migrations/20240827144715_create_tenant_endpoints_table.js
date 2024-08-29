/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('tenantEndpoints', function (table) {
    table.uuid('tenantId').notNullable()
    table.enum('type', ['WebhookBaseUrl', 'RatesUrl'])

    table.string('value').notNullable()
    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
    table.timestamp('deletedAt').nullable().defaultTo(null)

    table.foreign('tenantId').references('id').inTable('tenants')
    table.primary(['tenantId', 'type'])
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable('tenantEndpoints')
}
