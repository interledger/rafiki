/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('interactions', function (table) {
    table.uuid('id').notNullable().primary()

    table.string('ref').notNullable().unique()
    table.string('nonce').notNullable()
    table.string('state').notNullable()

    table.uuid('grantId').notNullable()
    table.foreign('grantId').references('grants.id').onDelete('CASCADE')

    table.integer('expiresIn').notNullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('interactions')
}
