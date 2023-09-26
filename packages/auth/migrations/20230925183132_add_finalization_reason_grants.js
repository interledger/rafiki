/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .hasColumn('grants', 'finalizationReason')
    .then((exists) => {
      if (!exists) {
        return knex.schema.alterTable('grants', (table) => {
          table.enum('finalizationReason', ['ISSUED', 'REVOKED', 'REJECTED'])
        })
      }
    })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema
    .hasColumn('grants', 'finalizationReason')
    .then((exists) => {
      if (exists) {
        return knex.schema.alterTable('grants', (table) => {
          table.dropColumn('finalizationReason')
        })
      }
    })
}
