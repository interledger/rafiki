module.exports = async () => {
  await global.__CARD_SERVICE_KNEX__.migrate.rollback(
    { directory: __dirname + '/migrations' },
    true
  )
  await global.__CARD_SERVICE_KNEX__.destroy()
  if (global.__CARD_SERVICE_POSTGRES__) {
    await global.__CARD_SERVICE_POSTGRES__.stop()
  }
  if (global.__CARD_SERVICE_REDIS__) {
    await global.__CARD_SERVICE_REDIS__.stop()
  }
}
