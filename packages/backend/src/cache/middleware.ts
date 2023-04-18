import isEqual from 'lodash/isEqual'
import { Logger } from 'pino'
import { CacheDataStore } from './data-stores'

interface CachedRequest {
  requestResult: unknown
  requestParams: Record<string, unknown>
  operationName: string
}

type Request = () => Promise<unknown>

interface CacheMiddlewareArgs {
  deps: { logger: Logger; dataStore: CacheDataStore }
  idempotencyKey: string | undefined
  request: Request
  requestParams: Record<string, unknown>
  operationName: string
  handleParamMismatch: () => never
}

export async function cacheMiddleware(
  args: CacheMiddlewareArgs
): ReturnType<Request> {
  const {
    deps: { dataStore },
    idempotencyKey,
    request
  } = args
  if (!idempotencyKey) {
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
    handleParamMismatch
  } = args

  logger.info('Cache hit')

  let parsedRequest: CachedRequest

  try {
    parsedRequest = JSON.parse(cachedRequest)
  } catch (error) {
    logger.error('Could not parse cache', { cachedRequest })

    await dataStore.delete(idempotencyKey)
    return request()
  }

  if (
    parsedRequest?.operationName !== operationName ||
    !isEqual(
      parsedRequest.requestParams,
      JSON.parse(JSON.stringify(requestParams))
    )
  ) {
    logger.error(
      `Incoming request is different than the original request for idempotencyKey: ${idempotencyKey}`,
      {
        requestParams: JSON.parse(JSON.stringify(requestParams)),
        cachedRequestParams: parsedRequest?.requestParams
      }
    )
    return handleParamMismatch()
  }

  return parsedRequest.requestResult
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

  let requestResult: unknown

  try {
    requestResult = await request()
  } catch (err) {
    await dataStore.delete(idempotencyKey)
    throw err
  }

  const toCache: CachedRequest = {
    requestResult,
    requestParams,
    operationName
  }

  await dataStore.set(idempotencyKey, JSON.stringify(toCache))

  return requestResult
}
