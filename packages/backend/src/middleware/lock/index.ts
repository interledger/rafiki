import { Logger } from 'pino'

type Request = () => Promise<unknown>

export interface Lock {
  acquire(key: string): Promise<boolean>
  release(key: string): Promise<void>
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
    return next()
  }

  if (!(await lock.acquire(key))) {
    logger.info(`Failed to acquire lock for key: ${key}`)

    return onFailToAcquireLock()
  }

  try {
    return await next()
  } finally {
    await lock.release(key)
  }
}
