import pino from 'pino'
import { CacheDataStore } from './data-stores'
import { cacheMiddleware } from './middleware'
import { v4 as uuid } from 'uuid'

const createTestDataStore = (): CacheDataStore => {
  const map = new Map<string, string>()

  return {
    async get(key): Promise<string | undefined> {
      return map.get(key)
    },
    async delete(key): Promise<boolean> {
      return map.delete(key)
    },
    async set(key: string, value: string): Promise<boolean> {
      map.set(key, value)
      return true
    }
  }
}

describe('Cache Middleware', (): void => {
  const logger = pino({ level: 'silent' })
  const defaultRequest = () => Promise.resolve('requestResult')
  const defaultOperationName = 'defaultOperationName'

  const dataStore = createTestDataStore()
  const handleParamMismatch = () => {
    throw new Error('Param mismatch')
  }

  afterEach(async (): Promise<void> => {
    jest.restoreAllMocks()
  })

  test('Calls request function if no idempotencyKey provided', async () => {
    const dataStoreGetSpy = jest.spyOn(dataStore, 'get')
    const dataStoreSetSpy = jest.spyOn(dataStore, 'set')

    await expect(
      cacheMiddleware({
        deps: { logger, dataStore },
        operationName: defaultOperationName,
        requestParams: {},
        idempotencyKey: undefined,
        request: defaultRequest,
        handleParamMismatch
      })
    ).resolves.toBe(await defaultRequest())

    expect(dataStoreGetSpy).not.toHaveBeenCalled()
    expect(dataStoreSetSpy).not.toHaveBeenCalled()
  })

  describe('Cache miss', () => {
    test('sets cache properly', async () => {
      const idempotencyKey = uuid()

      const dataStoreGetSpy = jest.spyOn(dataStore, 'get')
      const dataStoreSetSpy = jest.spyOn(dataStore, 'set')
      const dataStoreDeleteSpy = jest.spyOn(dataStore, 'delete')

      await expect(
        cacheMiddleware({
          deps: { logger, dataStore },
          operationName: defaultOperationName,
          requestParams: { foo: 'bar' },
          idempotencyKey,
          request: defaultRequest,
          handleParamMismatch
        })
      ).resolves.toBe(await defaultRequest())

      expect(dataStoreGetSpy).toHaveBeenCalledTimes(1)
      expect(dataStoreSetSpy).toHaveBeenCalledWith(
        idempotencyKey,
        JSON.stringify({
          requestResult: await defaultRequest(),
          requestParams: { foo: 'bar' },
          operationName: defaultOperationName
        })
      )
      expect(dataStoreDeleteSpy).not.toHaveBeenCalled()
    })

    test('returns result even if failed to cache', async () => {
      const idempotencyKey = uuid()

      const dataStoreGetSpy = jest.spyOn(dataStore, 'get')
      const dataStoreSetSpy = jest
        .spyOn(dataStore, 'set')
        .mockImplementationOnce(() => {
          throw new Error()
        })
      const dataStoreDeleteSpy = jest.spyOn(dataStore, 'delete')

      await expect(
        cacheMiddleware({
          deps: { logger, dataStore },
          operationName: defaultOperationName,
          requestParams: { foo: 'bar' },
          idempotencyKey,
          request: defaultRequest,
          handleParamMismatch
        })
      ).resolves.toBe(await defaultRequest())

      expect(dataStoreGetSpy).toHaveBeenCalledTimes(1)
      expect(await dataStore.get(idempotencyKey)).toBeUndefined()
      expect(dataStoreSetSpy).toHaveBeenCalledWith(
        idempotencyKey,
        JSON.stringify({
          requestResult: await defaultRequest(),
          requestParams: { foo: 'bar' },
          operationName: defaultOperationName
        })
      )
      expect(dataStoreDeleteSpy).not.toHaveBeenCalled()
    })
  })

  describe('Cache hit', () => {
    test('removes key if could not parse from cache', async () => {
      const idempotencyKey = uuid()
      await dataStore.set(idempotencyKey, '{}{}{}{{')

      const dataStoreGetSpy = jest.spyOn(dataStore, 'get')
      const dataStoreSetSpy = jest.spyOn(dataStore, 'set')
      const dataStoreDeleteSpy = jest.spyOn(dataStore, 'delete')

      await expect(
        cacheMiddleware({
          deps: { logger, dataStore },
          operationName: defaultOperationName,
          requestParams: {},
          idempotencyKey,
          request: defaultRequest,
          handleParamMismatch
        })
      ).resolves.toBe(await defaultRequest())

      expect(dataStoreGetSpy).toHaveBeenCalledTimes(1)
      expect(dataStoreSetSpy).not.toHaveBeenCalled()
      expect(dataStoreDeleteSpy).toHaveBeenCalledWith(idempotencyKey)
    })

    test('throws if mismatch on operation name', async () => {
      const idempotencyKey = uuid()
      await cacheMiddleware({
        deps: { logger, dataStore },
        operationName: defaultOperationName,
        requestParams: {},
        idempotencyKey,
        request: defaultRequest,
        handleParamMismatch
      })

      const dataStoreSetSpy = jest.spyOn(dataStore, 'set')
      const dataStoreDeleteSpy = jest.spyOn(dataStore, 'delete')

      await expect(
        cacheMiddleware({
          deps: { logger, dataStore },
          operationName: 'otherOperationName',
          requestParams: {},
          idempotencyKey,
          request: defaultRequest,
          handleParamMismatch
        })
      ).rejects.toThrow('Param mismatch')

      expect(dataStoreSetSpy).not.toHaveBeenCalled()
      expect(dataStoreDeleteSpy).not.toHaveBeenCalled()
    })

    test('throws if mismatch on original request parameters', async () => {
      const idempotencyKey = uuid()
      await expect(
        cacheMiddleware({
          deps: { logger, dataStore },
          operationName: defaultOperationName,
          requestParams: { foo: 'bar' },
          idempotencyKey,
          request: defaultRequest,
          handleParamMismatch
        })
      ).resolves.toBe(await defaultRequest())

      const dataStoreSetSpy = jest.spyOn(dataStore, 'set')
      const dataStoreDeleteSpy = jest.spyOn(dataStore, 'delete')

      await expect(
        cacheMiddleware({
          deps: { logger, dataStore },
          operationName: defaultOperationName,
          requestParams: { abc: 'def' },
          idempotencyKey,
          request: defaultRequest,
          handleParamMismatch
        })
      ).rejects.toThrow('Param mismatch')

      expect(dataStoreSetSpy).not.toHaveBeenCalled()
      expect(dataStoreDeleteSpy).not.toHaveBeenCalled()
    })

    test('returns request result if cached', async () => {
      const idempotencyKey = uuid()
      const request = () => Promise.resolve(true)

      await expect(
        cacheMiddleware({
          deps: { logger, dataStore },
          operationName: defaultOperationName,
          requestParams: {},
          idempotencyKey,
          request,
          handleParamMismatch
        })
      ).resolves.toBe(true)

      const dataStoreSetSpy = jest.spyOn(dataStore, 'set')
      const dataStoreDeleteSpy = jest.spyOn(dataStore, 'delete')

      await expect(
        cacheMiddleware({
          deps: { logger, dataStore },
          operationName: defaultOperationName,
          requestParams: {},
          idempotencyKey,
          request,
          handleParamMismatch
        })
      ).resolves.toBe(await request())

      expect(dataStoreSetSpy).not.toHaveBeenCalled()
      expect(dataStoreDeleteSpy).not.toHaveBeenCalled()
    })

    test('returns request result if cached, request params in different order', async () => {
      const idempotencyKey = uuid()
      const request = () => Promise.resolve(true)

      await cacheMiddleware({
        deps: { logger, dataStore },
        operationName: defaultOperationName,
        requestParams: { arg: { nested: 10 }, foo: 'bar' },
        idempotencyKey,
        request,
        handleParamMismatch
      })

      const dataStoreSetSpy = jest.spyOn(dataStore, 'set')
      const dataStoreDeleteSpy = jest.spyOn(dataStore, 'delete')

      await expect(
        cacheMiddleware({
          deps: { logger, dataStore },
          operationName: defaultOperationName,
          requestParams: { foo: 'bar', arg: { nested: 10 } },
          idempotencyKey,
          request,
          handleParamMismatch
        })
      ).resolves.toBe(await request())

      expect(dataStoreSetSpy).not.toHaveBeenCalled()
      expect(dataStoreDeleteSpy).not.toHaveBeenCalled()
    })
  })
})
