module.exports = async () => {
<<<<<<< HEAD
  await global.__AUTH_KNEX__.migrate.rollback(
    { directory: './packages/auth/migrations' },
    true
  )
  await global.__AUTH_KNEX__.destroy()
  if (global.__AUTH_POSTGRES__) {
    await global.__AUTH_POSTGRES__.stop()
=======
  await global.__BACKEND_KNEX__.migrate.rollback(
    { directory: './packages/backend/migrations' },
    true
  )
  await global.__BACKEND_KNEX__.destroy()
  if (global.__BACKEND_POSTGRES__) {
    await global.__BACKEND_POSTGRES__.stop()
>>>>>>> cd21893 (feat: tests)
  }
}
