module.exports = async () => {
  await global.__KNEX__.migrate.rollback(
    { directory: './packages/backend/migrations' },
    true
  )
  await global.__KNEX__.destroy()
}
