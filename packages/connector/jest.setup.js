// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GenericContainer } = require('testcontainers')

const REDIS_PORT = 6379

module.exports = async () => {
  if (!process.env.REDIS) {
    const redisContainer = await new GenericContainer('redis')
      .withExposedPorts(REDIS_PORT)
      .start()

    global.__CONNECTOR_REDIS__ = redisContainer
    process.env.REDIS = `redis://localhost:${redisContainer.getMappedPort(
      REDIS_PORT
    )}`
  }
}
