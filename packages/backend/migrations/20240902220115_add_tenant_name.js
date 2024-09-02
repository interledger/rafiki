/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema
      .table('tenants', function (table) {
        table.string('name').unique().notNullable()
      })
  }
  
  /**
   * @param { import("knex").Knex } knex
   * @returns { Promise<void> }
   */
  exports.down = function (knex) {
    return knex.schema
      .table('tenants', function (table) {
        table.dropColumn('name')
      })
      
  }
  