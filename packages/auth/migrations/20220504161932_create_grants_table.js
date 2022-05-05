exports.up = function (knex) {
  return knex.schema.createTable('grants', function (table) {
    table.uuid('id').notNullable().primary()

    table.string('state').notNullable()
    table.string('type').notNullable()
    table.specificType('actions', 'text[]').notNullable()
    table.specificType('start', 'text[]').notNullable()

    table.string('continueToken')
    table.string('continueId')
    table.integer('wait')

    table.specificType('finish', 'text[]').notNullable()
    table.string('finishUri').notNullable()
    table.string('nonce').notNullable()

    table.string('interactRef').notNullable()
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('grants')
}
