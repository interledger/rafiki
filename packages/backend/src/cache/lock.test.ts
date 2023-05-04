import Redis from 'ioredis'
import pino from 'pino'
import { v4 as uuid } from 'uuid'
import { Config } from '../config/app'
import { lockMiddleware, Lock, createRedisLock } from './lock'

const createTestLock = (): Lock => {
  const map = new Map<string, string>()

  return {
    async acquire(key: string) {
      if (map.get(key)) {
        return false
      }

      map.set(key, new Date().toISOString())

      return true
    },
    async release(key: string): Promise<void> {
      map.delete(key)
    }
  }
}

describe('Lock Middleware', (): void => {
  const logger = pino({ level: 'silent' })
  const defaultRequest = () => Promise.resolve('requestResult')

  const lock = createTestLock()
  const onFailToAcquireLock = () => {
    throw new Error('Concurrent request')
  }

  afterEach(async (): Promise<void> => {
    jest.restoreAllMocks()
  })

  test('Calls request function if no key provided', async () => {
    const lockAcquireSpy = jest.spyOn(lock, 'acquire')
    const lockReleaseSpy = jest.spyOn(lock, 'release')

    await expect(
      lockMiddleware({
        deps: { logger, lock },
        key: undefined,
        next: defaultRequest,
        onFailToAcquireLock
      })
    ).resolves.toBe(await defaultRequest())

    expect(lockAcquireSpy).not.toHaveBeenCalled()
    expect(lockReleaseSpy).not.toHaveBeenCalled()
  })

  test('Acquires and releases lock on request', async () => {
    const lockAcquireSpy = jest.spyOn(lock, 'acquire')
    const lockReleaseSpy = jest.spyOn(lock, 'release')

    await expect(
      lockMiddleware({
        deps: { logger, lock },
        key: uuid(),
        next: defaultRequest,
        onFailToAcquireLock
      })
    ).resolves.toEqual(await defaultRequest())
    expect(lockAcquireSpy).toHaveBeenCalledTimes(1)
    expect(lockReleaseSpy).toHaveBeenCalledTimes(1)
  })

  test('Acquires and releases lock even if request throws', async () => {
    const lockAcquireSpy = jest.spyOn(lock, 'acquire')
    const lockReleaseSpy = jest.spyOn(lock, 'release')

    const key = uuid()

    await expect(
      lockMiddleware({
        deps: { logger, lock },
        key,
        next: () => {
          throw new Error('fail')
        },
        onFailToAcquireLock
      })
    ).rejects.toThrow(new Error('fail'))
    expect(lockAcquireSpy).toHaveBeenCalledTimes(1)
    expect(lockReleaseSpy).toHaveBeenCalledTimes(1)
  })

  test('Fails to acquire lock if concurrent request', async () => {
    const lockAcquireSpy = jest.spyOn(lock, 'acquire')
    const lockReleaseSpy = jest.spyOn(lock, 'release')

    const key = uuid()

    const [firstRequest, secondRequest, thirdRequest] =
      await Promise.allSettled([
        lockMiddleware({
          deps: { logger, lock },
          key,
          next: defaultRequest,
          onFailToAcquireLock
        }),
        lockMiddleware({
          deps: { logger, lock },
          key,
          next: defaultRequest,
          onFailToAcquireLock
        }),
        lockMiddleware({
          deps: { logger, lock },
          key,
          next: defaultRequest,
          onFailToAcquireLock
        })
      ])

    expect(firstRequest).toEqual({
      status: 'fulfilled',
      value: await defaultRequest()
    })
    expect(secondRequest).toEqual({
      status: 'rejected',
      reason: new Error('Concurrent request')
    })
    expect(thirdRequest).toEqual({
      status: 'rejected',
      reason: new Error('Concurrent request')
    })
    expect(lockAcquireSpy).toHaveBeenCalledTimes(3)
    expect(lockReleaseSpy).toHaveBeenCalledTimes(1)
  })
})

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
    redis.disconnect()
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
      await new Promise((resolve) => setTimeout(resolve, redisLockTtlMs))
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
