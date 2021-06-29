module.exports = async () => {
  await global.__BACKEND_KNEX__.migrate.rollback(
    { directory: './packages/backend/migrations' },
    true
  )
  await global.__BACKEND_KNEX__.destroy()
}
