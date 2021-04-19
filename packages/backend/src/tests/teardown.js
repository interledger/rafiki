module.exports = async () => {
  await global.__KNEX__.migrate.rollback({}, true)
  await global.__KNEX__.destroy()
}
