exports.up = function (knex) {
  return knex.schema.alterTable('accesses', function (table) {
    table.uuid('resourceId')
    table.foreign('resourceId').references('resourceSets.id')

    table.setNullable('grantId')
    table.check(
      '"grantId" is not null or "resourceId" is not null',
      ['grantId', 'resourceId'],
      'grant_id_or_resource_id'
    )
  })
}

exports.down = function (knex) {
  return knex.schema.alterTable('accesses', function (table) {
    table.dropChecks(['grant_id_or_resource_id'])
    table.dropColumn('resourceId')
    table.dropNullable('grantId')
  })
}
