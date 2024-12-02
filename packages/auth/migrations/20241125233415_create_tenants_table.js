/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('tenants', function (table) {
    table.uuid('id').notNullable().primary()
<<<<<<< HEAD
    table.string('idpConsentUrl')
    table.string('idpSecret')
=======
    table.string('idpConsentUrl').notNullable()
    table.string('idpSecret').notNullable()
>>>>>>> ea7e6603 (feat(auth): tenants table v1 (#3133))

    table.timestamp('createdAt').defaultTo(knex.fn.now())
    table.timestamp('updatedAt').defaultTo(knex.fn.now())
    table.timestamp('deletedAt')
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
<<<<<<< HEAD
  return knex.schema.dropTableIfExists('tenants')
=======
  knex.schema.dropTableIfExists('tenants')
>>>>>>> ea7e6603 (feat(auth): tenants table v1 (#3133))
}
