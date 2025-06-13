/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('webhooks', function (table) {
      table.uuid('id').notNullable().primary()
      table
        .uuid('eventId')
        .notNullable()
        .references('webhookEvents.id')
        .onDelete('CASCADE')
        .index()
      table
        .uuid('recipientTenantId')
        .notNullable()
        .references('tenants.id')
        .onDelete('CASCADE')
        .index()

      table.integer('attempts').notNullable().defaultTo(0)
      table.integer('statusCode').nullable()

      table.timestamp('processAt').nullable().defaultTo(knex.fn.now())

      table.timestamp('createdAt').defaultTo(knex.fn.now())
      table.timestamp('updatedAt').defaultTo(knex.fn.now())

      table.index('processAt')
    })
    .then(() => {
      return knex.raw(
        `INSERT INTO "webhooks" (id, "eventId", "recipientTenantId", attempts, "statusCode", "processAt") select gen_random_uuid(), id as "eventId", "tenantId" as "recipientTenantId", attempts, "statusCode", "processAt" from "webhookEvents"`
      )
    })
    .then(() => {
      return knex.schema.alterTable('webhookEvents', (table) => {
        table.dropColumn('attempts')
        table.dropColumn('statusCode')
        table.dropColumn('processAt')
      })
    })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema
    .alterTable('webhookEvents', function (table) {
      table.integer('attempts').notNullable().defaultTo(0)
      table.integer('statusCode').nullable()
      table.timestamp('processAt').nullable().defaultTo(knex.fn.now())
      table.index('processAt')
    })
    .then(() => {
      return knex.raw(
        `UPDATE "webhookEvents" SET "attempts" = (SELECT "attempts" from "webhooks" where "recipientTenantId" = "webhookEvents"."tenantId" AND "eventId" = "webhookEvents"."id"), "statusCode" = (SELECT "statusCode" from "webhooks" where "recipientTenantId" = "webhookEvents"."tenantId" AND "eventId" = "webhookEvents"."id"), "processAt" = (SELECT "processAt" from "webhooks" where "recipientTenantId" = "webhookEvents"."tenantId" AND "eventId" = "webhookEvents"."id")`
      )
    })
    .then(() => {
      return knex.schema.dropTableIfExists('webhooks')
    })
}
