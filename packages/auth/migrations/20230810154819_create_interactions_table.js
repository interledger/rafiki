/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return Promise.all([
    knex.schema.createTable('interactions', function (table) {
      table.uuid('id').notNullable().primary()

      table.string('ref').notNullable().unique()
      table.string('nonce').notNullable()
      table.string('state').notNullable()

      table.uuid('grantId').notNullable()
      table.foreign('grantId').references('grants.id').onDelete('CASCADE')

      table.integer('expiresIn').notNullable()

      table.timestamp('createdAt').defaultTo(knex.fn.now())
      table.timestamp('updatedAt').defaultTo(knex.fn.now())
    }),
    knex.schema.alterTable('grants', function (table) {
      table.dropColumn('interactId')
      table.dropColumn('interactRef')
      table.dropColumn('interactNonce')
    })
  ])
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return Promise.all([
    knex.schema.dropTableIfExists('interactions'),
    knex.schema.alterTable('grants', function (table) {
      table.string('interactId').unique()
      table.string('interactRef').unique()
      table.string('interactNonce').unique()
    })
  ])
}
