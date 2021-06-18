// eslint-disable-next-line @typescript-eslint/no-var-requires
const IORedis = require('ioredis')

const REDIS_URL = process.env.REDIS || 'redis://127.0.0.1:6380'
const redis = new IORedis(REDIS_URL, { lazyConnect: true })

module.exports = async () => {
  await redis.connect()
  if (redis.status === 'ready') {
    await redis.disconnect()
  } else {
    throw new Error('expected redis at ' + REDIS_URL)
  }
}
