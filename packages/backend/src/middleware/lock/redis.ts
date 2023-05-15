import Redis from 'ioredis'
import { Lock } from './index'

interface CreateRedisLockArgs {
  redisClient: Redis
  keyTtlMs: number
  keyPrefix?: string
}

export function createRedisLock(args: CreateRedisLockArgs): Lock {
  const getFullKeyName = (key: string) => `${args.keyPrefix || 'lock'}:${key}`

  return {
    async acquire(key: string): Promise<boolean> {
      const { redisClient, keyTtlMs } = args
      const expiryDate = new Date(Date.now() + keyTtlMs).toISOString()

      return !!(await redisClient.set(
        getFullKeyName(key),
        expiryDate,
        'PX',
        keyTtlMs,
        'NX'
      ))
    },
    async release(key: string): Promise<void> {
      await args.redisClient.del(getFullKeyName(key))
    }
  }
}
