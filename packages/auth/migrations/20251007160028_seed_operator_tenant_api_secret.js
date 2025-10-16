const OPERATOR_TENANT_ID = process.env['OPERATOR_TENANT_ID']
const ADMIN_API_SECRET = process.env['ADMIN_API_SECRET']

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  if (!OPERATOR_TENANT_ID) {
    throw new Error(
      'Could not seed operator tenant API secret. Please configure OPERATOR_TENANT_ID environment variable'
    )
  }

  if (!ADMIN_API_SECRET) {
    throw new Error(
      'Could not seed operator tenant API secret. Please configure ADMIN_API_SECRET environment variable'
    )
  }

  return knex.schema
    .alterTable('tenants', function (table) {
      table.string('apiSecret')
    })
    .then(() => {
      return knex.raw(`
        UPDATE "tenants" SET "apiSecret" = '${ADMIN_API_SECRET}'
        WHERE "id" = '${OPERATOR_TENANT_ID}'
    `)
    })
    .then(() => {
      return knex.schema.alterTable('tenants', (table) => {
        table.string('apiSecret').notNullable().alter()
      })
    })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('tenants', function (table) {
    table.dropColumn('apiSecret')
  })
}
