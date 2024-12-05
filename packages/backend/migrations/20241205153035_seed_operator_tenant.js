/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.raw(`
        INSERT INTO "tenants" ("id", "apiSecret") 
        VALUES ('${process.env['OPERATOR_TENANT_ID']}', '${process.env['OPERATOR_TENANT_SECRET']}')
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
