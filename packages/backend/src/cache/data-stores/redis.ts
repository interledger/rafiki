import { Redis } from 'ioredis'
import { CacheDataStore } from '.'

export function createRedisDataStore(
  redisClient: Redis,
  keyTtlMs: number
): CacheDataStore {
  return {
    keyTtlMs,
    async get(key: string): Promise<string | undefined> {
      return (await redisClient.get(key)) || undefined
    },
    async set(key: string, value: string): Promise<string> {
      const res = await redisClient.set(key, value)
      await redisClient.expire(key, this.keyTtlMs)

      return res
    },
    async delete(key: string): Promise<boolean> {
      return (await redisClient.del(key)) > 0
    }
  }
}
