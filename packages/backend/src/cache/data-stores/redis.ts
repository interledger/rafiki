import { Redis } from 'ioredis'
import { CacheDataStore } from '.'

export function createRedisDataStore(
  redisClient: Redis,
  keyTtlMs: number
): CacheDataStore {
  return {
    async get(key: string): Promise<string | undefined> {
      return (await redisClient.get(key)) || undefined
    },
    async set(key: string, value: string): Promise<boolean> {
      return (await redisClient.set(key, value, 'PX', keyTtlMs)) === 'OK'
    },
    async delete(key: string): Promise<boolean> {
      return (await redisClient.del(key)) > 0
    }
  }
}
