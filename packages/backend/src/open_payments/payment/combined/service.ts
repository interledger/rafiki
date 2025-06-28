import { TransactionOrKnex } from 'objection'
import { BaseService } from '../../../shared/baseService'
import { Pagination, SortOrder } from '../../../shared/baseModel'
import { CombinedPayment } from './model'
import { FilterString } from '../../../shared/filters'
import { OutgoingPaymentService } from '../outgoing/service'
import { IncomingPaymentService } from '../incoming/service'

interface CombinedPaymentFilter {
  walletAddressId?: FilterString
  type?: FilterString
}
interface GetPageOptions {
  pagination?: Pagination
  filter?: CombinedPaymentFilter
  sortOrder?: SortOrder
  tenantId?: string
}

export interface CombinedPaymentService {
  getPage(options?: GetPageOptions): Promise<CombinedPayment[]>
}

export interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  incomingPaymentService: IncomingPaymentService
  outgoingPaymentService: OutgoingPaymentService
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
  const { filter, pagination, sortOrder, tenantId } = options ?? {}

  const query = CombinedPayment.query(deps.knex)

  if (tenantId) {
    query.where('tenantId', tenantId)
  }

  if (filter?.walletAddressId?.in && filter.walletAddressId.in.length) {
    query.whereIn('walletAddressId', filter.walletAddressId.in)
  }

  if (filter?.type?.in && filter.type.in.length) {
    query.whereIn('type', filter.type.in)
  }

  return await query.getPage(pagination, sortOrder)
}
