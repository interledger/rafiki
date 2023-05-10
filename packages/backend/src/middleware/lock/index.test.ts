import pino from 'pino'
import { v4 as uuid } from 'uuid'
import { lockMiddleware, Lock } from '.'

const createTestLock = (): Lock => {
  const map = new Map<string, string>()

  return {
    async acquire(key: string) {
      if (map.get(key)) {
        return false
      }

      map.set(key, new Date().toISOString())

      return true
    },
    async release(key: string): Promise<void> {
      map.delete(key)
    }
  }
}

describe('Lock Middleware', (): void => {
  const logger = pino({ level: 'silent' })
  const defaultRequest = () => Promise.resolve('requestResult')

  const lock = createTestLock()
  const onFailToAcquireLock = () => {
    throw new Error('Concurrent request')
  }

  afterEach(async (): Promise<void> => {
    jest.restoreAllMocks()
  })

  test('Calls request function if no key provided', async () => {
    const lockAcquireSpy = jest.spyOn(lock, 'acquire')
    const lockReleaseSpy = jest.spyOn(lock, 'release')

    await expect(
      lockMiddleware({
        deps: { logger, lock },
        key: undefined,
        next: defaultRequest,
        onFailToAcquireLock
      })
    ).resolves.toBe(await defaultRequest())

    expect(lockAcquireSpy).not.toHaveBeenCalled()
    expect(lockReleaseSpy).not.toHaveBeenCalled()
  })

  test('Acquires and releases lock on request', async () => {
    const lockAcquireSpy = jest.spyOn(lock, 'acquire')
    const lockReleaseSpy = jest.spyOn(lock, 'release')

    await expect(
      lockMiddleware({
        deps: { logger, lock },
        key: uuid(),
        next: defaultRequest,
        onFailToAcquireLock
      })
    ).resolves.toEqual(await defaultRequest())
    expect(lockAcquireSpy).toHaveBeenCalledTimes(1)
    expect(lockReleaseSpy).toHaveBeenCalledTimes(1)
  })

  test('Acquires and releases lock even if request throws', async () => {
    const lockAcquireSpy = jest.spyOn(lock, 'acquire')
    const lockReleaseSpy = jest.spyOn(lock, 'release')

    const key = uuid()

    await expect(
      lockMiddleware({
        deps: { logger, lock },
        key,
        next: () => {
          throw new Error('fail')
        },
        onFailToAcquireLock
      })
    ).rejects.toThrow(new Error('fail'))
    expect(lockAcquireSpy).toHaveBeenCalledTimes(1)
    expect(lockReleaseSpy).toHaveBeenCalledTimes(1)
  })

  test('Fails to acquire lock if concurrent request', async () => {
    const lockAcquireSpy = jest.spyOn(lock, 'acquire')
    const lockReleaseSpy = jest.spyOn(lock, 'release')

    const key = uuid()

    const [firstRequest, secondRequest, thirdRequest] =
      await Promise.allSettled([
        lockMiddleware({
          deps: { logger, lock },
          key,
          next: defaultRequest,
          onFailToAcquireLock
        }),
        lockMiddleware({
          deps: { logger, lock },
          key,
          next: defaultRequest,
          onFailToAcquireLock
        }),
        lockMiddleware({
          deps: { logger, lock },
          key,
          next: defaultRequest,
          onFailToAcquireLock
        })
      ])

    expect(firstRequest).toEqual({
      status: 'fulfilled',
      value: await defaultRequest()
    })
    expect(secondRequest).toEqual({
      status: 'rejected',
      reason: new Error('Concurrent request')
    })
    expect(thirdRequest).toEqual({
      status: 'rejected',
      reason: new Error('Concurrent request')
    })
    expect(lockAcquireSpy).toHaveBeenCalledTimes(3)
    expect(lockReleaseSpy).toHaveBeenCalledTimes(1)
  })
})
