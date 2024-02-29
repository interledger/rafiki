import { createRedisDataStore } from './redis'
import Redis from 'ioredis'
import assert from 'assert'
import { Config } from '../../../config/app'

describe('Redis Data Store', (): void => {
  const redis = new Redis(Config.redisUrl, {
    tls: Config.redisTls,
    stringNumbers: true
  })

  const ttlMs = 100
  const dataStore = createRedisDataStore(redis, ttlMs)

  afterEach(async () => {
    jest.useRealTimers()
    await redis.flushall()
  })

  afterAll(async () => {
    await redis.quit()
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
      await new Promise((resolve) => setTimeout(resolve, ttlMs + 2))
      await expect(dataStore.get('foo')).resolves.toBeUndefined()
    })
  })

  describe('getKeyExpiry', (): void => {
    test('returns undefined if key not set', async () => {
      await expect(dataStore.get('foo')).resolves.toBeUndefined()
      await expect(dataStore.getKeyExpiry('foo')).resolves.toBeUndefined()
    })

    test('returns value if key set', async () => {
      const now = Date.now()
      jest.useFakeTimers({ now })

      await expect(dataStore.set('foo', 'bar')).resolves.toBe(true)

      const keyExpiry = await dataStore.getKeyExpiry('foo')
      assert.ok(keyExpiry)

      const difference = keyExpiry?.getTime() - now

      expect(ttlMs <= difference && difference <= ttlMs + 5).toBe(true) // ideally the key expiry would be set at exactly now + ttlMs, but we give redis some margin
    })
  })

  describe('delete', (): void => {
    test('deletes key', async () => {
      await expect(dataStore.set('foo', 'bar')).resolves.toBe(true)
      await expect(dataStore.delete('foo')).resolves.toBeUndefined()
      await expect(dataStore.get('foo')).resolves.toBeUndefined()
    })

    test('deletes unset key', async () => {
      await expect(dataStore.delete('foo')).resolves.toBeUndefined()
    })
  })

  describe('deleteAll', (): void => {
    test('deletes all keys', async () => {
      await expect(dataStore.set('foo', 'bar')).resolves.toBe(true)
      await expect(dataStore.set('one', 'two')).resolves.toBe(true)
      await expect(dataStore.deleteAll()).resolves.toBeUndefined()
      await expect(dataStore.get('foo')).resolves.toBeUndefined()
      await expect(dataStore.get('one')).resolves.toBeUndefined()
    })
  })
})
