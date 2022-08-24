exports.up = function (knex) {
  return knex.schema.createTable('assets', function (table) {
    table.uuid('id').notNullable().primary()

    // TigerBeetle account 2 byte ledger field representing account's asset
    table.specificType('ledger', 'smallserial').notNullable()
    table.string('code').notNullable()
    table.integer('scale').notNullable()

    table.bigInteger('withdrawalThreshold').nullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())

    table.unique(['code', 'scale'])

    table.index(['createdAt', 'id'])
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('assets')
}
