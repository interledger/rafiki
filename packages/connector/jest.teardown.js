module.exports = async () => {
  await global.__CONNECTOR_REDIS__.stop()
}
