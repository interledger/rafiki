exports.up = function(knex) {
    return Promise.all([
        knex.schema.table('assets', (table) => {
            table.renameColumn('liquidityThreshold', 'liquidityThresholdLow')
            table.bigInteger('liquidityThresholdHigh').nullable()
        }),
        knex.schema.table('peers', (table) => {
            table.renameColumn('liquidityThreshold', 'liquidityThresholdLow')
            table.bigInteger('liquidityThresholdHigh').nullable()
        })
    ])
}

exports.down = function(knex) {
    return Promise.all([
        knex.schema.table('assets', (table) => {
            table.renameColumn('liquidityThresholdLow', 'liquidityThreshold')
            table.dropColumn('liquidityThresholdHigh')
        }),
        knex.schema.table('peers', (table) => {
            table.renameColumn('liquidityThresholdLow', 'liquidityThreshold')
            table.dropColumn('liquidityThresholdHigh')
        })
    ])
}
