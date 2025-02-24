import { ForeignKeyViolationError } from 'objection'
import { BaseService } from '../shared/baseService'
import { FeeError } from './errors'
import { Fee, FeeType } from './model'
import { Pagination, SortOrder } from '../shared/baseModel'
import { CacheDataStore } from '../middleware/cache/data-stores'

export interface CreateOptions {
  assetId: string
  type: FeeType
  fee: {
    fixed: bigint
    basisPoints: number
  }
}

export interface FeeService {
  create(CreateOptions: CreateOptions): Promise<Fee | FeeError>
  getPage(
    assetId: string,
    pagination?: Pagination,
    sortOrder?: SortOrder
  ): Promise<Fee[]>
  getLatestFee(assetId: string, type: FeeType): Promise<Fee | undefined>
  get(id: string): Promise<Fee | undefined>
}

interface ServiceDependencies extends BaseService {
  feeCache: CacheDataStore<Fee>
}

export async function createFeeService({
  logger,
  knex,
  feeCache
}: ServiceDependencies): Promise<FeeService> {
  const deps: ServiceDependencies = {
    logger: logger.child({
      service: 'FeeService'
    }),
    knex,
    feeCache
  }
  return {
    create: (options: CreateOptions) => createFee(deps, options),
    getPage: (
      assetId: string,
      pagination: Pagination,
      sortOrder = SortOrder.Desc
    ) => getFeesPage(deps, assetId, pagination, sortOrder),
    getLatestFee: (assetId: string, type: FeeType) =>
      getLatestFee(deps, assetId, type),
    get: (id: string) => getById(deps, id)
  }
}

async function getFeesPage(
  deps: ServiceDependencies,
  assetId: string,
  pagination?: Pagination,
  sortOrder?: SortOrder
): Promise<Fee[]> {
  const query = Fee.query(deps.knex)
    .where({ assetId })
    .getPage(pagination, sortOrder)

  return await query
}

async function getById(
  deps: ServiceDependencies,
  id: string
): Promise<Fee | undefined> {
  const cachedFee = await deps.feeCache.get(id)

  if (cachedFee) {
    return cachedFee
  }

  const fee = await Fee.query(deps.knex).findById(id)

  if (fee) await deps.feeCache.set(id, fee)

  return fee
}

async function getLatestFee(
  deps: ServiceDependencies,
  assetId: string,
  type: FeeType
): Promise<Fee | undefined> {
  const cachedFee = await deps.feeCache.get(`${assetId}${type}`)

  if (cachedFee) {
    return cachedFee
  }

  const latestFee = await Fee.query(deps.knex)
    .where({ assetId, type })
    .orderBy('createdAt', 'desc')
    .first()

  if (latestFee) await deps.feeCache.set(`${assetId}${type}`, latestFee)

  return latestFee
}

async function createFee(
  deps: ServiceDependencies,
  { assetId, type, fee }: CreateOptions
): Promise<Fee | FeeError> {
  const { fixed, basisPoints } = fee

  if (fixed < 0) {
    return FeeError.InvalidFixedFee
  }

  if (basisPoints < 0 || basisPoints > 10_000) {
    return FeeError.InvalidBasisPointFee
  }

  try {
    const fee = await Fee.query(deps.knex).insertAndFetch({
      assetId: assetId,
      type: type,
      basisPointFee: basisPoints,
      fixedFee: fixed
    })

    await deps.feeCache.set(`${assetId}${type}`, fee)
    return fee
  } catch (error) {
    if (error instanceof ForeignKeyViolationError) {
      return FeeError.UnknownAsset
    }
    throw error
  }
}
