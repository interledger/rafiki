exports.up = function (knex) {
  return knex.schema.createTable('grants', function (table) {
    table.uuid('id').notNullable().primary()

    table.string('state').notNullable()
    table.specificType('startMethod', 'text[]').notNullable()
    table.integer('interval')

    table.string('continueToken').unique()
    table.string('continueId').unique()
    table.integer('wait')

    table.string('finishMethod').notNullable()
    table.string('finishUri').notNullable()
    table.string('clientNonce').notNullable()
    table.string('clientKeyId').notNullable()

    table.string('interactId').notNullable().unique()
    table.string('interactRef').notNullable().unique()
    table.string('interactNonce').notNullable().unique()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('grants')
}
