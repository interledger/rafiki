import { TransactionOrKnex } from 'objection'
import { BaseService } from '../../../shared/baseService'
import { Pagination } from '../../../shared/baseModel'
import { IncomingPayment } from '../incoming/model'
import { OutgoingPayment } from '../outgoing/model'

type CombinedPaymentOptions = any
type CombinedPayment = IncomingPayment | OutgoingPayment

export interface CombinedPaymentService {
  getPage(pagination?: Pagination): Promise<CombinedPayment[]>
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
    getPage: (pagination?: Pagination) =>
      getCombinedPaymentsPage(deps, pagination)
  }
}

async function getCombinedPaymentsPage(
  deps: ServiceDependencies,
  pagination?: Pagination
) {
  return []
}
