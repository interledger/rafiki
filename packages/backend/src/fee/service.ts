import { ForeignKeyViolationError } from 'objection'
import { BaseService } from '../shared/baseService'
import { FeeError } from './errors'
import { Fee, FeeType } from './model'
import { Pagination, SortOrder } from '../shared/baseModel'

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
  getById(feeId: string): Promise<Fee | undefined>
}

type ServiceDependencies = BaseService

export async function createFeeService({
  logger,
  knex
}: ServiceDependencies): Promise<FeeService> {
  const deps: ServiceDependencies = {
    logger: logger.child({
      service: 'FeeService'
    }),
    knex
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
    getById: (feeId: string) => getById(deps, feeId)
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

async function getLatestFee(
  deps: ServiceDependencies,
  assetId: string,
  type: FeeType
): Promise<Fee | undefined> {
  return await Fee.query(deps.knex)
    .where({ assetId, type })
    .orderBy('createdAt', 'desc')
    .first()
}

async function getById(
  deps: ServiceDependencies,
  feeId: string
): Promise<Fee | undefined> {
  return await Fee.query(deps.knex).findById(feeId)
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
    return await Fee.query(deps.knex).insertAndFetch({
      assetId: assetId,
      type: type,
      basisPointFee: basisPoints,
      fixedFee: fixed
    })
  } catch (error) {
    if (error instanceof ForeignKeyViolationError) {
      return FeeError.UnknownAsset
    }
    throw error
  }
}
