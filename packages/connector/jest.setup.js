// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GenericContainer } = require('testcontainers')

module.exports = async () => {
  const redisContainer = await new GenericContainer('redis')
    .withExposedPorts(6379)
    .start()

  global.__CONNECTOR_REDIS__ = redisContainer
  process.env.REDIS = `redis://localhost:${redisContainer.getMappedPort(6379)}`
}
