module.exports = async () => {
  await global.__AUTH_KNEX__.migrate.rollback(
    { directory: __dirname + '/migrations' },
    true
  )
  await global.__AUTH_KNEX__.destroy()
  if (global.__AUTH_POSTGRES__) {
    await global.__AUTH_POSTGRES__.stop()
  }
  if (global.__AUTH_REDIS__) {
    await global.__AUTH_REDIS__.stop()
  }
}
