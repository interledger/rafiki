exports.up = function (knex) {
  return knex.schema.createTable('paymentPointers', function (table) {
    table.uuid('id').notNullable().primary()
    table.uuid('assetId').notNullable()
    table.foreign('assetId').references('assets.id')

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('paymentPointers')
}
