// eslint-disable-next-line @typescript-eslint/no-var-requires
const { v4: uuid } = require('uuid')

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('ilpPeers', function (table) {
      table.uuid('id').notNullable().primary()

      table.uuid('peerId').notNullable().index().unique()
      table.foreign('peerId').references('peers.id')

      table.bigInteger('maxPacketAmount').nullable()

      table.string('staticIlpAddress').notNullable().index()

      table.timestamp('createdAt').defaultTo(knex.fn.now())
      table.timestamp('updatedAt').defaultTo(knex.fn.now())
    })
    .then(() =>
      knex('peers').select(
        'id',
        'staticIlpAddress',
        'maxPacketAmount',
        'createdAt',
        'updatedAt'
      )
    )
    .then((rows) => {
      if (rows.length > 0) {
        return knex('ilpPeers').insert(
          rows.map((r) => ({
            id: uuid(),
            peerId: r.id,
            staticIlpAddress: r.staticIlpAddress,
            maxPacketAmount: r.maxPacketAmount,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt
          }))
        )
      }
    })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('ilpPeers')
}
