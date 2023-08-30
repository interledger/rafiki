exports.up = function (knex) {
  return knex.schema.createTable('grants', function (table) {
    table.uuid('id').notNullable().primary()

    table.string('state')
    table.string('finalizationReason')
    table.specificType('startMethod', 'text[]')

    table.string('continueToken').notNullable().unique()
    table.string('continueId').notNullable().unique()
    table.integer('wait')

    table.string('finishMethod')
    table.string('finishUri')
    table.string('clientNonce')
    table.string('client').notNullable()

    table.string('interactId').unique()
    table.string('interactRef').unique()
    table.string('interactNonce').unique()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('grants')
}
