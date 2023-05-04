import Redis from 'ioredis'
import { Logger } from 'pino'

type Request = () => Promise<unknown>

export interface Lock {
  acquire(key: string): Promise<boolean>
  release(key: string): Promise<void>
}

interface CreateRedisLockArgs {
  redisClient: Redis
  keyTtlMs: number
  keyPrefix?: string
}

export function createRedisLock(args: CreateRedisLockArgs): Lock {
  const getFullKeyName = (key: string) => `${args.keyPrefix || 'lock'}:${key}`

  return {
    async acquire(key: string): Promise<boolean> {
      const expiryDate = new Date(Date.now() + args.keyTtlMs).toISOString()

      return !!(await args.redisClient.set(
        getFullKeyName(key),
        expiryDate,
        'PX',
        args.keyTtlMs,
        'NX'
      ))
    },
    async release(key: string): Promise<void> {
      await args.redisClient.del(getFullKeyName(key))
    }
  }
}

interface LockMiddlewareArgs {
  deps: { logger: Logger; lock: Lock }
  key: string | undefined
  onFailToAcquireLock: Request
  next: Request
}

export async function lockMiddleware(
  args: LockMiddlewareArgs
): ReturnType<Request> {
  const {
    deps: { logger, lock },
    key,
    onFailToAcquireLock,
    next
  } = args

  if (!key) {
    logger.info('No key provided')

    return next()
  }

  if (!(await lock.acquire(key))) {
    return onFailToAcquireLock()
  }

  try {
    return await next()
  } finally {
    await lock.release(key)
  }
}
