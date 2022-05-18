exports.up = function (knex) {
  return knex.schema.createTable('grants', function (table) {
    table.uuid('id').notNullable().primary()

    table.string('state').notNullable()
    table.string('type').notNullable()
    table.specificType('actions', 'text[]').notNullable()
    table.specificType('startMethod', 'text[]').notNullable()
    table.integer('interval')

    table.string('continueToken')
    table.string('continueId')
    table.integer('wait')

    table.string('finishMethod').notNullable()
    table.string('finishUri').notNullable()
    table.string('clientNonce').notNullable()

    table.string('interactId').notNullable()
    table.string('interactRef').notNullable()
    table.string('interactNonce').notNullable()
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('grants')
}
