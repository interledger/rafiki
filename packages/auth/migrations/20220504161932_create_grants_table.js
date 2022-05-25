exports.up = function (knex) {
  return knex.schema.createTable('grants', function (table) {
    table.uuid('id').notNullable().primary()

    table.string('state').notNullable()
    table.string('type').notNullable()
    table.specificType('actions', 'text[]').notNullable()
    table.specificType('startMethod', 'text[]').notNullable()

    table.string('continueToken')
    table.string('continueId')
    table.integer('wait')

    table.string('finishMethod').notNullable()
    table.string('finishUri').notNullable()
    table.string('nonce').notNullable()

    table.string('interactRef').notNullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('grants')
}
