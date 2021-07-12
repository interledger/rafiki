module.exports = async () => {
  await global.__ACCOUNTS_KNEX__.migrate.rollback(
    { directory: __dirname + '/migrations' },
    true
  )
  await global.__ACCOUNTS_KNEX__.destroy()
  if (global.__ACCOUNTS_POSTGRES__) {
    await global.__ACCOUNTS_POSTGRES__.stop()
  }
  if (global.__TIGERBEETLE__) {
    await global.__TIGERBEETLE__.stop()
  }
}
