/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex('tenants').insert({
    id: '8e1db008-ab2f-4f1d-8c44-593354084100',
    email: 'admin@example.com',
    publicName: 'Super tenant',
    apiSecret: 'secret'
  })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex('tenants')
    .where('id', '8e1db008-ab2f-4f1d-8c44-593354084100')
    .del()
}
