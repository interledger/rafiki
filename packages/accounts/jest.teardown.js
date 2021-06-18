module.exports = async () => {
  await global.__ACCOUNTS_KNEX__.migrate.rollback(
    { directory: __dirname + '/migrations' },
    true
  )
  await global.__ACCOUNTS_KNEX__.destroy()
}
