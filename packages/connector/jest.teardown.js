module.exports = async () => {
  await global.__KNEX__.migrate.rollback(
    { directory: __dirname + '/migrations' },
    true
  )
  await global.__KNEX__.destroy()
}
