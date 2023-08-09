import { ForeignKeyViolationError } from 'objection'
import { BaseService } from '../shared/baseService'
import { FeeError } from './errors'
import { Fee, FeeType } from './model'

interface CreateOptions {
  assetId: string
  type: FeeType
  fee: {
    fixed: bigint
    percentage: number
  }
}

export interface FeeService {
  create(CreateOptions: CreateOptions): Promise<Fee | FeeError>
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
    create: (options: CreateOptions) => createFee(deps, options)
  }
}

async function createFee(
  deps: ServiceDependencies,
  { assetId, type, fee }: CreateOptions
): Promise<Fee | FeeError> {
  const { fixed, percentage } = fee

  if (fixed === BigInt(0) && Number(percentage.toFixed(4)) === 0) {
    return FeeError.MissingFee
  }

  if (fixed < 0) {
    return FeeError.InvalidFixedFee
  }

  if (percentage < 0 || percentage > 1) {
    return FeeError.InvalidPercentageFee
  }

  try {
    return await Fee.query(deps.knex).insertAndFetch({
      assetId: assetId,
      type: type,
      activatedAt: new Date(),
      percentageFee: percentage.toString(),
      fixedFee: fixed
    })
  } catch (error) {
    if (error instanceof ForeignKeyViolationError) {
      return FeeError.UnknownAsset
    }
    throw error
  }
}
