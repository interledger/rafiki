import { CacheDataStore } from '.'

interface Cached<T> {
  expiry: number
  data: T
}

export function createInMemoryDataStore<T>(
  keyTtlMs: number
): CacheDataStore<T> {
  const map = new Map<string, Cached<T>>()

  const getAndCheckExpiry = (key: string): Cached<T> | undefined => {
    const cached = map.get(key)
    if (cached?.expiry && Date.now() >= cached.expiry) {
      deleteKey(key)
      return undefined
    }

    return cached
  }

  const deleteKey = (key: string) => map.delete(key)

  return {
    async get(key): Promise<T | undefined> {
      const cached = getAndCheckExpiry(key)

      return cached?.data
    },
    async getKeyExpiry(key: string): Promise<Date | undefined> {
      const cached = getAndCheckExpiry(key)

      return cached ? new Date(cached.expiry) : undefined
    },
    async delete(key): Promise<void> {
      deleteKey(key)
    },
    async set(key: string, value: T): Promise<boolean> {
      map.set(key, { expiry: Date.now() + keyTtlMs, data: value })
      return true
    },
    async deleteAll(): Promise<void> {
      map.clear()
    }
  }
}
