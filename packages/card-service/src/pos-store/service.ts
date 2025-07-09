import Redis from 'ioredis'
import { Logger } from 'pino'

export type StoreDependencies = {
  logger: Logger
  redis: Redis
}

export type PosStoreService = {
  addPOS: (requestId: string, POSHost: string) => Promise<void>
  getPOS: (requestId: string) => Promise<string>
  deletePOS: (requestId: string) => Promise<void>
}

export function createPOSStore(deps_: StoreDependencies): PosStoreService {
  const logger = deps_.logger.child({
    service: 'pos-store'
  })
  const deps = {
    ...deps_,
    logger
  }

  return {
    getPOS: (requestId: string) => getPOS(deps, requestId),
    addPOS: (requestId: string, POSHost: string) =>
      addPOS(deps, requestId, POSHost),
    deletePOS: (requestId: string) => deletePOS(deps, requestId)
  }
}

const getPOS = async (
  deps: StoreDependencies,
  requestId: string
): Promise<string> => {
  const POSHost = await deps.redis.get(requestId)
  if (!POSHost) {
    deps.logger.error({requestId}, `No POS found for requestId`)
    throw new Error(`No POS found for requestId: ${requestId}`)
  }

  return POSHost
}

const addPOS = async (
  deps: StoreDependencies,
  requestId: string,
  POSHost: string
) => {
  await deps.redis.set(requestId, POSHost, 'EX', 300)
  deps.logger.info({ requestId, POSHost }, 'POS was added for the given requestId')
}

const deletePOS = async (deps: StoreDependencies, requestId: string) => {
  const deletedRecords = await deps.redis.del([requestId])
  if (deletedRecords == 0) {
    deps.logger.error(`No POS record was deleted for requestId: ${requestId}`)
    throw new Error(`No POS record was deleted for requestId: ${requestId}`)
  }

  deps.logger.info(`POS record was deleted for requestId: ${requestId}`)
}
