exports.up = function (knex) {
  return knex.schema.createTable(
    'walletAddressAdditionalProperties',
    function (table) {
      table.uuid('id').notNullable().primary()
      table.string('fieldKey').notNullable().index()
      table.string('fieldValue').notNullable().index()
      table
        .boolean('visibleInOpenPayments')
        .notNullable()
        .defaultTo(false)
        .index()
      table
        .uuid('walletAddressId')
        .notNullable()
        .references('walletAddresses.id')
        .index()
        .onDelete('CASCADE')
      table.timestamp('createdAt').index().defaultTo(knex.fn.now())
      table.timestamp('updatedAt').index().defaultTo(knex.fn.now())
    }
  )
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('walletAddressAdditionalProperties')
}
