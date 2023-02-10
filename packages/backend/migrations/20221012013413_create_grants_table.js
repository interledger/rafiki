exports.up = function (knex) {
  return knex.schema.createTable('grants', function (table) {
    table.uuid('id').notNullable().primary()
    table.uuid('authServerId').notNullable()
    table.foreign('authServerId').references('authServers.id')
    table.string('continueId').nullable()
    table.string('continueToken').nullable()
    table.string('accessToken').notNullable().unique()
    table.string('managementId').notNullable()
    table.string('accessType').notNullable()
    table.specificType('accessActions', 'text[]')

    table.timestamp('expiresAt').nullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())

    table.unique(['authServerId', 'accessType', 'accessActions'])
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('grants')
}
