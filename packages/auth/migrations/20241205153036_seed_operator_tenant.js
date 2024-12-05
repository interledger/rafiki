/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.raw(`
        INSERT INTO "tenants" ("id", "idpConsentUrl", "idpSecret") 
        VALUES ('${process.env['OPERATOR_TENANT_ID']}', '${process.env['IDENTITY_SERVER_URL']}', '${process.env['IDENTITY_SERVER_SECRET']}')
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
