import * as objection from 'objection'
import { PaymentProgress } from './model'
import { BaseService } from '../shared/baseService'

export interface PaymentProgressService {
  get(paymentId: string): Promise<PaymentProgress | undefined>
  create(paymentId: string): Promise<PaymentProgress>
  increase(paymentId: string, amounts: Amounts): Promise<void>
}

type ServiceDependencies = BaseService

export async function createPaymentProgressService(
  deps_: ServiceDependencies
): Promise<PaymentProgressService> {
  const deps: ServiceDependencies = {
    ...deps_,
    logger: deps_.logger.child({
      service: 'PaymentProgressService'
    })
  }
  return {
    get: (paymentId: string) => getPaymentProgress(deps, paymentId),
    create: (paymentId: string) => createPaymentProgress(deps, paymentId),
    increase: (paymentId: string, amounts: Amounts) =>
      increasePaymentProgress(deps, paymentId, amounts)
  }
}

async function getPaymentProgress(
  deps: ServiceDependencies,
  paymentId: string
): Promise<PaymentProgress | undefined> {
  return PaymentProgress.query(deps.knex).findById(paymentId)
}

async function createPaymentProgress(
  deps: ServiceDependencies,
  paymentId: string
): Promise<PaymentProgress> {
  return PaymentProgress.query(deps.knex).insertAndFetch({
    id: paymentId,
    amountSent: BigInt(0),
    amountDelivered: BigInt(0)
  })
}

type Amounts = {
  amountSent: bigint
  amountDelivered: bigint
}

// Update the Progress amounts, but only ever increase them (in case updates arrive to postgres out-of-order).
async function increasePaymentProgress(
  deps: ServiceDependencies,
  paymentId: string,
  newAmounts: Amounts
): Promise<void> {
  await PaymentProgress.query(deps.knex)
    .findById(paymentId)
    .patch({
      amountSent: objection.raw('GREATEST("amountSent", ?)', [
        newAmounts.amountSent
      ]),
      amountDelivered: objection.raw('GREATEST("amountDelivered", ?)', [
        newAmounts.amountDelivered
      ])
    })
}
