const grantsTable = 'grants'
const finalizationReasonColumn = 'finalizationReason'
const finalzationReasonType = 'finalization_reason_type'
const finalizationReasonList = ['ISSUED', 'REVOKED', 'REJECTED']

const toPsqlList = (list) => `(${list.map((el) => `'${el}'`).join(', ')})`

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .hasColumn(grantsTable, finalizationReasonColumn)
    .then((exists) => {
      if (!exists) {
        return knex.schema.alterTable(grantsTable, (table) => {
          table.enum(finalizationReasonColumn, finalizationReasonList, {
            useNative: true,
            enumName: finalzationReasonType
          })
        })
      }

      return knex.schema.raw(
        `CREATE TYPE ${finalzationReasonType} AS ENUM ${toPsqlList(
          finalizationReasonList
        )};
        ALTER TABLE "${grantsTable}" ALTER COLUMN "${finalizationReasonColumn}" TYPE ${finalzationReasonType} USING "${finalizationReasonColumn}"::${finalzationReasonType}`
      )
    })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema
    .hasColumn(grantsTable, finalizationReasonColumn)
    .then((exists) => {
      if (exists) {
        return knex.schema
          .alterTable(grantsTable, (table) => {
            table.dropColumn(finalizationReasonColumn)
          })
          .then(() => {
            return knex.schema.raw(
              `DROP TYPE IF EXISTS ${finalzationReasonType}`
            )
          })
      }
    })
}
