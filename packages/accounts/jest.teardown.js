module.exports = async () => {
  await global.__ACCOUNTS_KNEX__.migrate.rollback(
    { directory: __dirname + '/migrations' },
    true
  )
  await global.__ACCOUNTS_KNEX__.destroy()
  await global.__ACCOUNTS_POSTGRES__.stop()
  await global.__TIGERBEETLE__.stop()
}
