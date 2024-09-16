/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('tenants', function (table) {
    table.uuid('id').primary()
    table.string('kratosIdentityId').notNullable()
    table.string('email').notNullable()
    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
    table.timestamp('deletedAt').nullable().defaultTo(null)
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable('tenants')
}
