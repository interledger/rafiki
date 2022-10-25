exports.up = function (knex) {
  return knex.schema.createTable('grants', function (table) {
    table.uuid('id').notNullable().primary()
    table.uuid('authServerId').notNullable()
    table.foreign('authServerId').references('authServers.id')
    table.string('continueId').nullable()
    table.string('continueToken').nullable()
    table.string('accessToken').nullable().unique()
    table
      .enu('accessType', ['incoming-payment', 'outgoing-payment', 'quote'], {
        useNative: true,
        enumName: 'access_type'
      })
      .notNullable()
    table.specificType('accessActions', 'access_action[]')

    table.timestamp('expiresAt').nullable()

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())

    table.unique(['authServerId', 'accessType', 'accessActions'])
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('grants')
}
