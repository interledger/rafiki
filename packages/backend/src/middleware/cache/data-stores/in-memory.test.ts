import { createInMemoryDataStore } from './in-memory'

describe('In-Memory Data Store', (): void => {
  const ttlMs = 100
  const dataStore = createInMemoryDataStore(ttlMs)

  afterEach(async () => {
    await dataStore.deleteAll()
    jest.useRealTimers()
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
      await expect(dataStore.getKeyExpiry('foo')).resolves.toBeUndefined()
    })

    test('returns value if key set', async () => {
      const now = Date.now()
      jest.useFakeTimers({ now })

      await expect(dataStore.set('foo', 'bar')).resolves.toBe(true)
      await expect(dataStore.getKeyExpiry('foo')).resolves.toEqual(
        new Date(now + ttlMs)
      )
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
