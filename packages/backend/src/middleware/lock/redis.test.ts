import Redis from 'ioredis'
import { v4 as uuid } from 'uuid'
import { Config } from '../../config/app'
import { createRedisLock } from './redis'

describe('Redis Lock', (): void => {
  const redis = new Redis(Config.redisUrl, {
    tls: Config.redisTls,
    stringNumbers: true
  })

  afterEach(async () => {
    jest.useRealTimers()
    await redis.flushall()
  })

  afterAll(async () => {
    await redis.quit()
  })

  describe('acquire', () => {
    test('properly sets key', async () => {
      const now = Date.now()
      jest.useFakeTimers({ now })

      const redisLockTtlMs = 10000
      const keyPrefix = 'lock-prefix'
      const redisLock = createRedisLock({
        redisClient: redis,
        keyTtlMs: redisLockTtlMs,
        keyPrefix
      })
      const key = uuid()

      await expect(redisLock.acquire(key)).resolves.toBe(true)
      await expect(redis.get(`${keyPrefix}:${key}`)).resolves.toBe(
        new Date(now + redisLockTtlMs).toISOString()
      )
    })

    test('properly sets key with default prefix', async () => {
      const now = Date.now()
      jest.useFakeTimers({ now })

      const redisLockTtlMs = 10000
      const redisLock = createRedisLock({
        redisClient: redis,
        keyTtlMs: redisLockTtlMs
      })
      const key = uuid()

      await expect(redisLock.acquire(key)).resolves.toBe(true)
      await expect(redis.get(`lock:${key}`)).resolves.toBe(
        new Date(now + redisLockTtlMs).toISOString()
      )
    })

    test('returns false if lock already acquired', async () => {
      const redisLockTtlMs = 10000
      const redisLock = createRedisLock({
        redisClient: redis,
        keyTtlMs: redisLockTtlMs
      })
      const key = uuid()

      await expect(redisLock.acquire(key)).resolves.toBe(true)
      await expect(redisLock.acquire(key)).resolves.toBe(false)
    })

    test('lock expires properly', async () => {
      const redisLockTtlMs = 100
      const redisLock = createRedisLock({
        redisClient: redis,
        keyTtlMs: redisLockTtlMs
      })
      const key = uuid()

      await expect(redisLock.acquire(key)).resolves.toBe(true)
      await expect(redis.get(`lock:${key}`)).resolves.toBeDefined()
      await new Promise((resolve) => setTimeout(resolve, redisLockTtlMs + 2))
      await expect(redis.get(`lock:${key}`)).resolves.toBeFalsy()
      await expect(redisLock.acquire(key)).resolves.toBe(true)
    })
  })

  describe('release', () => {
    test('properly deletes key', async () => {
      const redisLockTtlMs = 10000
      const redisLock = createRedisLock({
        redisClient: redis,
        keyTtlMs: redisLockTtlMs
      })
      const key = uuid()

      await expect(redisLock.acquire(key)).resolves.toBe(true)
      await redisLock.release(key)

      await expect(redis.get(`lock:${key}`)).resolves.toBeFalsy()
    })

    test('can re-acquire key after release', async () => {
      const redisLockTtlMs = 10000
      const redisLock = createRedisLock({
        redisClient: redis,
        keyTtlMs: redisLockTtlMs
      })
      const key = uuid()

      await expect(redisLock.acquire(key)).resolves.toBe(true)
      await redisLock.release(key)
      await expect(redisLock.acquire(key)).resolves.toBe(true)
      await expect(redis.get(`lock:${key}`)).resolves.toBeDefined()
    })
  })
})
