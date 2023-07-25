import { TransactionOrKnex } from 'objection'
import { BaseService } from '../../../shared/baseService'
import { Pagination } from '../../../shared/baseModel'
import { CombinedPayment, Payment, PaymentType } from './model'
import { FilterString } from '../../../shared/filters'
import { IncomingPayment } from '../incoming/model'
import { OutgoingPayment } from '../outgoing/model'
import { OutgoingPaymentService } from '../outgoing/service'
import { IncomingPaymentService } from '../incoming/service'
import { OutgoingPaymentError } from '../outgoing/errors'
import { IncomingPaymentError } from '../incoming/errors'

interface CombinedPaymentFilter {
  paymentPointerId?: FilterString
  type?: FilterString
}
interface GetPageOptions {
  pagination?: Pagination
  filter?: CombinedPaymentFilter
}

export interface CombinedPaymentService {
  getPage(options?: GetPageOptions): Promise<Payment[]>
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
  const { filter, pagination } = options ?? {}

  const query = CombinedPayment.query(deps.knex)

  if (filter?.paymentPointerId?.in && filter.paymentPointerId.in.length) {
    query.whereIn('paymentPointerId', filter.paymentPointerId.in)
  }

  if (filter?.type?.in && filter.type.in.length) {
    query.whereIn('type', filter.type.in)
  }

  const combinedPayments = await query.getPage(pagination)

  const payments: Payment[] = []
  for (const combinedPayment of combinedPayments) {
    if (combinedPayment.type === PaymentType.Incoming) {
      const incomingPayment = await deps.incomingPaymentService.get({
        id: combinedPayment.id
      })

      if (!incomingPayment) throw new Error(IncomingPaymentError.UnknownPayment)

      payments.push({ type: PaymentType.Incoming, data: incomingPayment })
    } else {
      const outgoingPayment = await deps.outgoingPaymentService.get({
        id: combinedPayment.id
      })

      if (!outgoingPayment) throw new Error(OutgoingPaymentError.UnknownPayment)

      payments.push({ type: PaymentType.Outgoing, data: outgoingPayment })
    }
  }

  return payments
}
