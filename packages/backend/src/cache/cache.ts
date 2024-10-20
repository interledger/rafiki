import { CacheDataStore, CacheSupport } from './index'

export interface Cached {
  expiry: number
  data: CacheSupport
}

export function createInMemoryDataStore(keyTtlMs: number): CacheDataStore {
  const map = new Map<string, Cached>()

  const getAndCheckExpiry = (key: string): Cached | undefined => {
    const cached = map.get(key)
    if (cached?.expiry && Date.now() >= cached.expiry) {
      deleteKey(key)
      return undefined
    }
    return cached
  }

  const deleteKey = (key: string) => map.delete(key)

  return {
    async get(key: string): Promise<CacheSupport> {
      if (keyTtlMs < 1) return undefined
      const cached = getAndCheckExpiry(key)
      return cached?.data
    },
    async getKeyExpiry(key: string): Promise<Date | undefined> {
      const cached = getAndCheckExpiry(key)

      return cached ? new Date(cached.expiry) : undefined
    },
    async delete(key: string): Promise<void> {
      deleteKey(key)
    },
    async set(key: string, value: CacheSupport): Promise<boolean> {
      if (keyTtlMs < 1) return true
      map.set(key, { expiry: Date.now() + keyTtlMs, data: value })
      return true
    },
    async deleteAll(): Promise<void> {
      map.clear()
    }
  }
}
export { CacheDataStore }
