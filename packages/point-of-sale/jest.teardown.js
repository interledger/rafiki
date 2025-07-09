module.exports = async () => {
  await global.__BACKEND_KNEX__.migrate.rollback(
    { directory: __dirname + '/migrations' },
    true
  )
  await global.__BACKEND_KNEX__.destroy()
  if (global.__BACKEND_POSTGRES__) {
    await global.__BACKEND_POSTGRES__.stop()
  }
  if (global.__BACKEND_REDIS__) {
    await global.__BACKEND_REDIS__.stop()
  }
}
