exports.up = function (knex) {
  return knex.schema.createTable('assets', function (table) {
    table.uuid('id').notNullable().primary()

    // TigerBeetle account 2 byte unit field representing account's asset
    table.specificType('unit', 'smallserial').notNullable()
    table.string('code').notNullable()
    table.integer('scale').notNullable()

    table.bigInteger('withdrawalThreshold').nullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())

    table.unique(['code', 'scale'])
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('assets')
}
