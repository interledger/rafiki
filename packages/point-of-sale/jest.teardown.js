module.exports = async () => {
  await global.__POS_KNEX__.migrate.rollback(
    { directory: __dirname + '/migrations' },
    true
  )
  await global.__POS_KNEX__.destroy()
  if (global.__POS_POSTGRES__) {
    await global.__POS_POSTGRES__.stop()
  }
}
