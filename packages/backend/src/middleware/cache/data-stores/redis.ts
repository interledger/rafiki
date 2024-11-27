import { Redis } from 'ioredis'
import { CacheDataStore } from '.'

export function createRedisDataStore(
  redisClient: Redis,
  keyTtlMs: number
): CacheDataStore<string> {
  return {
    async get(key: string): Promise<string | undefined> {
      return (await redisClient.get(key)) || undefined
    },
    async getKeyExpiry(key: string): Promise<Date | undefined> {
      const expiryTimestamp = await redisClient.pexpiretime(key)
      return expiryTimestamp && expiryTimestamp > 0
        ? new Date(+expiryTimestamp)
        : undefined
    },
    async set(key: string, value: string): Promise<boolean> {
      return (await redisClient.set(key, value, 'PX', keyTtlMs)) === 'OK'
    },
    async delete(key: string): Promise<void> {
      await redisClient.del(key)
    },
    async deleteAll(): Promise<void> {
      await redisClient.flushall()
    }
  }
}
