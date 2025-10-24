module.exports = async () => {
  if (global.__CARD_SERVICE_REDIS__) {
    await global.__CARD_SERVICE_REDIS__.stop()
  }
}
