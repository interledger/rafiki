import { GenericContainer } from 'testcontainers'
require('./jest.env') // set environment variables

const REDIS_PORT = 6379

const setup = async (): Promise<void> => {
  const setupRedis = async () => {
    if (!process.env.REDIS_URL) {
      const redisContainer = await new GenericContainer('redis:7')
        .withExposedPorts(REDIS_PORT)
        .start()

      global.__CARD_SERVICE_REDIS__ = redisContainer
      process.env.REDIS_URL = `redis://localhost:${redisContainer.getMappedPort(
        REDIS_PORT
      )}`
    }
  }

  await Promise.all([setupRedis()])
}

export default setup
