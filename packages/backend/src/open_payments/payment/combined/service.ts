import { TransactionOrKnex } from 'objection'
import { BaseService } from '../../../shared/baseService'
import { Pagination } from '../../../shared/baseModel'
import { CombinedPayment } from './model'
import { FilterString } from '../../../shared/filters'

interface CombinedPaymentFilter {
  paymentPointerId?: FilterString
}
interface GetPageOptions {
  pagination?: Pagination
  filter?: CombinedPaymentFilter
}

export interface CombinedPaymentService {
  getPage(options?: GetPageOptions): Promise<CombinedPayment[]>
}

export interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
}

export async function createCombinedPaymentService(
  deps_: ServiceDependencies
): Promise<CombinedPaymentService> {
  const deps = {
    ...deps_,
    logger: deps_.logger.child({ service: 'OutgoingPaymentService' })
  }
  return {
    getPage: (options?: GetPageOptions) =>
      getCombinedPaymentsPage(deps, options)
  }
}

async function getCombinedPaymentsPage(
  deps: ServiceDependencies,
  options?: GetPageOptions
) {
  const { filter, pagination } = options ?? {}

  const query = CombinedPayment.query(deps.knex)

  if (filter?.paymentPointerId?.in && filter.paymentPointerId.in.length > 0) {
    query.whereIn('paymentPointerId', filter.paymentPointerId.in)
  }

  return await query.getPage(pagination)
}
