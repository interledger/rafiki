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
    deps: { logger, dataStore },
    idempotencyKey,
    request,
    operationName,
    requestParams,
    handleParamMismatch
  } = args
  if (!idempotencyKey) {
    logger.info('No idempotencyKey given')
    return request()
  }

  const cachedRequest = await dataStore.get(idempotencyKey)

  if (cachedRequest) {
    let parsedRequest: CachedRequest

    try {
      parsedRequest = JSON.parse(cachedRequest)
    } catch (error) {
      logger.error('Could not parse cache', { cachedRequest })

      await dataStore.delete(idempotencyKey)
      return request()
    }

    if (
      parsedRequest.operationName !== operationName ||
      !isEqual(
        parsedRequest.requestParams,
        JSON.parse(JSON.stringify(requestParams))
      )
    ) {
      logger.error(
        `Incoming request is different than the original request for idempotencyKey: ${idempotencyKey}`,
        {
          requestParams: JSON.parse(JSON.stringify(requestParams)),
          cachedRequestParams: parsedRequest.requestParams
        }
      )
      return handleParamMismatch()
    }

    logger.info('Cache hit')
    return parsedRequest.requestResult
  }

  logger.info('Normally resolving')
  const requestResult = await request()

  const toCache: CachedRequest = {
    requestResult,
    requestParams,
    operationName
  }

  await dataStore.set(idempotencyKey, JSON.stringify(toCache))

  return requestResult
}
