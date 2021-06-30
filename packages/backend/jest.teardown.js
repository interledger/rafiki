module.exports = async () => {
  await global.__BACKEND_KNEX__.migrate.rollback(
    { directory: './packages/backend/migrations' },
    true
  )
  await global.__BACKEND_KNEX__.destroy()
  await global.__BACKEND_POSTGRES__.stop()
  await global.__BACKEND_REDIS__.stop()
}
