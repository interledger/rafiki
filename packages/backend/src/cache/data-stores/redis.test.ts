import { createRedisDataStore } from './redis'
import Redis from 'ioredis'
import { Config } from '../../config/app'

describe('Redis Data Store', (): void => {
  const redis = new Redis(Config.redisUrl, {
    tls: Config.redisTls,
    stringNumbers: true
  })

  const ttlMs = 100
  const dataStore = createRedisDataStore(redis, ttlMs)

  afterEach(async () => {
    await redis.flushall()
  })

  afterAll(async () => {
    redis.disconnect()
  })

  describe('set', (): void => {
    test('returns true if key set properly', async () => {
      await expect(dataStore.set('foo', 'bar')).resolves.toBe(true)
    })

    test('values can be overriden', async () => {
      await expect(dataStore.set('foo', 'bar')).resolves.toBe(true)
      await expect(dataStore.set('foo', 'barbar')).resolves.toBe(true)
      await expect(dataStore.get('foo')).resolves.toBe('barbar')
    })
  })

  describe('get', (): void => {
    test('returns undefined if key not set', async () => {
      await expect(dataStore.get('foo')).resolves.toBeUndefined()
    })

    test('returns value if key set', async () => {
      await expect(dataStore.set('foo', 'bar')).resolves.toBe(true)
      await expect(dataStore.get('foo')).resolves.toBe('bar')
    })

    test('keys expire properly', async () => {
      await expect(dataStore.set('foo', 'bar')).resolves.toBe(true)
      await expect(dataStore.get('foo')).resolves.toBe('bar')
      await new Promise((resolve) => setTimeout(resolve, ttlMs))
      await expect(dataStore.get('foo')).resolves.toBeUndefined()
    })
  })

  describe('delete', (): void => {
    test('returns false if no key deleted', async () => {
      await expect(dataStore.delete('foo')).resolves.toBe(false)
    })

    test('returns true if key was deleted', async () => {
      await expect(dataStore.set('foo', 'bar')).resolves.toBe(true)
      await expect(dataStore.delete('foo')).resolves.toBe(true)
    })
  })
})
