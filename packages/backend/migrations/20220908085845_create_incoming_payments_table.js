exports.up = function (knex) {
  return knex.schema.createTable('incomingPayments', function (table) {
    table.uuid('id').notNullable().primary()

    // Open payments payment pointer id
    table.uuid('paymentPointerId').notNullable()
    table.foreign('paymentPointerId').references('paymentPointers.id')
    table.string('description').nullable()
    table.timestamp('expiresAt').notNullable()
    table.bigInteger('incomingAmountValue').nullable()
    table.string('state').notNullable()
    table.string('externalRef').nullable()
    table.uuid('connectionId').nullable()

    table.string('client').nullable()

    table.uuid('assetId').notNullable()
    table.foreign('assetId').references('assets.id')
    table.timestamp('processAt').nullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())

    table.index(['paymentPointerId', 'createdAt', 'id'])

    table.index('processAt')
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('incomingPayments')
}
