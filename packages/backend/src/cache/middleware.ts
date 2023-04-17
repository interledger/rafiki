import isEqual from 'lodash/isEqual'
import { Logger } from 'pino'
import { CacheDataStore } from './data-stores'

interface CachedRequest {
  status: 'PENDING' | 'DONE'
  data?: {
    requestResult: unknown
    requestParams: Record<string, unknown>
    operationName: string
  }
}

type Request = () => Promise<unknown>

interface CacheMiddlewareArgs {
  deps: { logger: Logger; dataStore: CacheDataStore }
  idempotencyKey: string | undefined
  request: Request
  requestParams: Record<string, unknown>
  operationName: string
  handleParamMismatch: () => never
  handleConcurrentRequest: () => never
}

export async function cacheMiddleware(
  args: CacheMiddlewareArgs
): ReturnType<Request> {
  const {
    deps: { logger, dataStore },
    idempotencyKey,
    request
  } = args
  if (!idempotencyKey) {
    logger.info('No idempotencyKey given')
    return request()
  }

  const cachedRequest = await dataStore.get(idempotencyKey)

  return cachedRequest
    ? handleCacheHit({ ...args, idempotencyKey }, cachedRequest)
    : handleCacheMiss({ ...args, idempotencyKey })
}

type HandleCacheHitArgs = Omit<CacheMiddlewareArgs, 'idempotencyKey'> & {
  idempotencyKey: string
}

async function handleCacheHit(
  args: HandleCacheHitArgs,
  cachedRequest: string
): ReturnType<Request> {
  const {
    deps: { logger, dataStore },
    idempotencyKey,
    request,
    operationName,
    requestParams,
    handleParamMismatch,
    handleConcurrentRequest
  } = args

  let parsedRequest: CachedRequest

  try {
    parsedRequest = JSON.parse(cachedRequest)

    if (parsedRequest.status === 'PENDING') {
      return handleConcurrentRequest()
    }
  } catch (error) {
    logger.error('Could not parse cache', { cachedRequest })

    await dataStore.delete(idempotencyKey)
    return request()
  }

  if (
    parsedRequest.data?.operationName !== operationName ||
    !isEqual(
      parsedRequest.data.requestParams,
      JSON.parse(JSON.stringify(requestParams))
    )
  ) {
    logger.error(
      `Incoming request is different than the original request for idempotencyKey: ${idempotencyKey}`,
      {
        requestParams: JSON.parse(JSON.stringify(requestParams)),
        cachedRequestParams: parsedRequest.data?.requestParams
      }
    )
    return handleParamMismatch()
  }

  return parsedRequest.data.requestResult
}

type HandleCacheMissArgs = HandleCacheHitArgs

async function handleCacheMiss(args: HandleCacheMissArgs) {
  const {
    deps: { logger, dataStore },
    idempotencyKey,
    request,
    operationName,
    requestParams
  } = args

  logger.info('Cache miss')

  const pendingCache: CachedRequest = {
    status: 'PENDING'
  }

  await dataStore.set(idempotencyKey, JSON.stringify(pendingCache))

  let requestResult: unknown

  try {
    requestResult = await request()
  } finally {
    await dataStore.delete(idempotencyKey)
  }

  const toCache: CachedRequest = {
    status: 'DONE',
    data: {
      requestResult,
      requestParams,
      operationName
    }
  }

  await dataStore.set(idempotencyKey, JSON.stringify(toCache))

  return requestResult
}
