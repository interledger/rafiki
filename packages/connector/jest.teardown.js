module.exports = async () => {
  if (global.__CONNECTOR_REDIS__) {
    await global.__CONNECTOR_REDIS__.stop()
  }
}
