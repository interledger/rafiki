/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createViewOrReplace(
    'combinedPaymentsView',
    function (view) {
      const sharedColumns = [
        'id',
        'paymentPointerId',
        'state',
        'client',
        'createdAt',
        'updatedAt',
        'metadata'
      ]
      view.columns([...sharedColumns, 'type'])
      view.as(
        knex('incomingPayments')
          .select([...sharedColumns, knex.raw("'INCOMING' AS type")])
          .unionAll((union) => {
            union
              .select([...sharedColumns, knex.raw("'OUTGOING' AS type")])
              .from('outgoingPayments')
          })
      )
    }
  )
}
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropViewIfExists('combinedPaymentsView')
}
