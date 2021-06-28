module.exports = async () => {
  await global.__CONNECTOR_KNEX__.migrate.rollback(
    { directory: __dirname + '/migrations' },
    true
  )
  await global.__CONNECTOR_KNEX__.destroy()
}
