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
  deps: { logger: Logger; dataStore: CacheDataStore<string> }
  idempotencyKey?: string
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

  const cachedRequestAsString = await dataStore.get(idempotencyKey)

  return cachedRequestAsString
    ? handleCacheHit({ ...args, idempotencyKey }, cachedRequestAsString)
    : handleCacheMiss({ ...args, idempotencyKey })
}

async function handleCacheHit(
  args: Required<CacheMiddlewareArgs>,
  cachedRequestAsString: string
): ReturnType<Request> {
  const {
    deps: { logger, dataStore },
    idempotencyKey,
    request,
    operationName,
    requestParams,
    handleParamMismatch
  } = args

  let cachedRequest: CachedRequest

  try {
    cachedRequest = JSON.parse(cachedRequestAsString)
  } catch (error) {
    logger.error('Could not parse cache', { cachedRequestAsString })

    await dataStore.delete(idempotencyKey)
    return request()
  }

  if (
    cachedRequest?.operationName !== operationName ||
    !isEqual(
      cachedRequest.requestParams,
      JSON.parse(JSON.stringify(requestParams))
    )
  ) {
    logger.error(
      {
        cachedRequest: {
          operationName: cachedRequest?.operationName,
          requestParams: cachedRequest?.requestParams
        },
        incomingRequest: {
          requestParams: JSON.parse(JSON.stringify(requestParams)),
          operationName
        }
      },
      `Incoming request is different than the original request for idempotencyKey: ${idempotencyKey}`
    )
    return handleParamMismatch()
  }

  return cachedRequest.requestResult
}

async function handleCacheMiss(args: Required<CacheMiddlewareArgs>) {
  const {
    deps: { logger, dataStore },
    idempotencyKey,
    request,
    operationName,
    requestParams
  } = args

  const requestResult = await request()

  const toCache: CachedRequest = {
    requestResult,
    requestParams,
    operationName
  }

  try {
    await dataStore.set(idempotencyKey, JSON.stringify(toCache))
  } catch (error) {
    const errorMessage =
      error instanceof Error && error.message ? error.message : error

    logger.error({ errorMessage, toCache }, 'Failed to cache request')
  }

  return requestResult
}
