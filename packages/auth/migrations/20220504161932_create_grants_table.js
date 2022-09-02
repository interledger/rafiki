exports.up = function (knex) {
  return knex.schema.createTable('grants', function (table) {
    table.uuid('id').notNullable().primary()

    table.string('state').notNullable()
    table.specificType('startMethod', 'text[]').notNullable()

    table.string('continueToken').notNullable().unique()
    table.string('continueId').notNullable().unique()
    table.integer('wait')

    table.string('finishMethod')
    table.string('finishUri')
    table.string('clientNonce')
    table.string('clientKeyId').notNullable()

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
