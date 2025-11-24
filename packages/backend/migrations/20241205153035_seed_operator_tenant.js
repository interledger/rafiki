/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

const OPERATOR_TENANT_ID = process.env['OPERATOR_TENANT_ID']
const OPERATOR_API_SECRET = process.env['ADMIN_API_SECRET']

exports.up = function (knex) {
  if (!OPERATOR_TENANT_ID || !OPERATOR_API_SECRET) {
    throw new Error(
      'Could not seed operator tenant. Please configure OPERATOR_TENANT_ID and ADMIN_API_SECRET environment variables'
    )
  }

  return knex.raw(`
        INSERT INTO "tenants" ("id", "apiSecret") 
        VALUES ('${OPERATOR_TENANT_ID}', '${OPERATOR_API_SECRET}')
    `)
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.raw(`
        TRUNCATE "tenants"
    `)
}
