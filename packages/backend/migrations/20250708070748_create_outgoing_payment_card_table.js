/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('outgoingPaymentCardDetails', function(table) {
        table.uuid('id').notNullable().primary()
        table.string('secret').notNullable();
        table.date('expiry').notNullable();
        table.uuid('outgoingPaymentId').notNullable();

        table.foreign('outgoingPaymentId')
            .references('id')
            .inTable('outgoingPayments')
            .onDelete('CASCADE');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema.dropTableIfExists('outgoingPaymentCardDetails');
};
