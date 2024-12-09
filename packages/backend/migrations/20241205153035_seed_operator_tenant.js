/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

const OPERATOR_TENANT_ID = process.env['OPERATOR_TENANT_ID']
const OPERATOR_TENANT_SECRET = process.env['OPERATOR_TENANT_SECRET']

exports.up = function (knex) {
  if (!OPERATOR_TENANT_ID || !OPERATOR_TENANT_SECRET) {
    throw new Error(
      'Could not seed operator tenant. Please configure OPERATOR_TENANT_ID and OPERATOR_TENANT_SECRET environment variables'
    )
  }

  return knex.raw(`
        INSERT INTO "tenants" ("id", "apiSecret") 
        VALUES ('${OPERATOR_TENANT_ID}', '${OPERATOR_TENANT_SECRET}')
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
