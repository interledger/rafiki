import { CheckViolationError, ForeignKeyViolationError } from 'objection'
import { BaseService } from '../shared/baseService'
import { FeeError } from './errors'
import { Fee, FeeType } from './model'

interface CreateOptions {
  assetId: string
  type: FeeType
  fee: {
    fixed?: bigint
    percentage?: number
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
  options: CreateOptions
): Promise<Fee | FeeError> {
  try {
    const fee: Partial<Fee> = {
      assetId: options.assetId,
      type: options.type
    }

    if (options.fee.percentage !== undefined) {
      fee.percentageFee = options.fee.percentage.toString()
    }

    if (options.fee.fixed !== undefined) {
      fee.fixedFee = options.fee.fixed
    }

    fee.activatedAt = new Date()

    return await Fee.query(deps.knex).insertAndFetch(fee)
  } catch (error) {
    if (error instanceof ForeignKeyViolationError) {
      return FeeError.UnknownAsset
    }
    if (
      error instanceof CheckViolationError &&
      error.constraint === 'fees_percentagefee_check'
    ) {
      return FeeError.InvalidFee
    }
    throw error
  }
}
