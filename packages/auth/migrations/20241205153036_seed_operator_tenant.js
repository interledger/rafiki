/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

const OPERATOR_TENANT_ID = process.env['OPERATOR_TENANT_ID']
const IDENTITY_SERVER_URL = process.env['IDENTITY_SERVER_URL']
const IDENTITY_SERVER_SECRET = process.env['IDENTITY_SERVER_SECRET']

exports.up = function (knex) {
  if (!OPERATOR_TENANT_ID) {
    throw new Error(
      'Could not seed operator tenant. Please configure OPERATOR_TENANT_ID environment variables'
    )
  }

  const seed = {
    id: OPERATOR_TENANT_ID
  }

  if (IDENTITY_SERVER_URL) {
    seed['idpConsentUrl'] = IDENTITY_SERVER_URL
  }

  if (IDENTITY_SERVER_SECRET) {
    seed['idpSecret'] = IDENTITY_SERVER_SECRET
  }

  return knex.raw(`
        INSERT INTO "tenants" (${Object.keys(seed)
          .map((key) => `"${key}"`)
          .join(', ')}) 
        VALUES (${Object.values(seed)
          .map((key) => `'${key}'`)
          .join(', ')})
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
