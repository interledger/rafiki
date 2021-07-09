import { TransactionOrKnex } from 'objection'
import * as Pay from '@interledger/pay'
import { RatesService } from 'rates'
import { BaseService } from '../shared/baseService'
import { OutgoingPayment, PaymentIntent, PaymentState } from './model'
import { AccountService } from '../account/service'
import { ConnectorService } from '../connector/service'
import { PaymentProgressService } from '../payment_progress/service'
import { IlpPlugin } from './ilp_plugin'
import * as lifecycle from './lifecycle'
import * as worker from './worker'

export interface OutgoingPaymentService {
  get(id: string): Promise<OutgoingPayment | undefined>
  create(options: CreateOutgoingPaymentOptions): Promise<OutgoingPayment>
  approve(id: string): Promise<OutgoingPayment>
  cancel(id: string): Promise<OutgoingPayment>
  requote(id: string): Promise<OutgoingPayment>
  processNext(): Promise<string | undefined>
}

export interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  slippage: number
  quoteLifespan: number // milliseconds
  accountService: AccountService
  connectorService: ConnectorService
  ratesService: RatesService
  makeIlpPlugin: (sourceAccountId: string) => IlpPlugin
  paymentProgressService: PaymentProgressService
}

export async function createOutgoingPaymentService(
  deps_: ServiceDependencies
): Promise<OutgoingPaymentService> {
  const deps = {
    ...deps_,
    logger: deps_.logger.child({ service: 'OutgoingPaymentService' })
  }
  return {
    get: (id) => getOutgoingPayment(deps, id),
    create: (options: CreateOutgoingPaymentOptions) =>
      createOutgoingPayment(deps, options),
    approve: (id) => approvePayment(deps, id),
    cancel: (id) => cancelPayment(deps, id),
    requote: (id) => requotePayment(deps, id),
    processNext: () => worker.processPendingPayment(deps)
  }
}

async function getOutgoingPayment(
  deps: ServiceDependencies,
  id: string
): Promise<OutgoingPayment | undefined> {
  return OutgoingPayment.query(deps.knex)
    .findById(id)
    .withGraphJoined('outcome')
}

type CreateOutgoingPaymentOptions = PaymentIntent & { superAccountId: string }

async function createOutgoingPayment(
  deps: ServiceDependencies,
  options: CreateOutgoingPaymentOptions
): Promise<OutgoingPayment> {
  const plugin = deps.makeIlpPlugin(options.superAccountId)
  const destination = await Pay.setupPayment({
    plugin,
    paymentPointer: options.paymentPointer,
    invoiceUrl: options.invoiceUrl
  }).finally(() => {
    plugin.disconnect().catch((err) => {
      deps.logger.warn({ error: err.message }, 'error disconnecting plugin')
    })
  })

  const sourceAccount = await deps.accountService.createSubAccount(
    options.superAccountId
  )

  return await OutgoingPayment.query(deps.knex).insertAndFetch({
    state: PaymentState.Inactive,
    intent: {
      paymentPointer: options.paymentPointer,
      invoiceUrl: options.invoiceUrl,
      amountToSend: options.amountToSend,
      autoApprove: options.autoApprove
    },
    superAccountId: options.superAccountId,
    sourceAccount: {
      id: sourceAccount.id,
      code: sourceAccount.currency,
      scale: sourceAccount.scale
    },
    destinationAccount: {
      scale: destination.destinationAsset.scale,
      code: destination.destinationAsset.code,
      url: destination.accountUrl,
      paymentPointer: destination.paymentPointer
    }
  })
}

function requotePayment(
  deps: ServiceDependencies,
  id: string
): Promise<OutgoingPayment> {
  return deps.knex.transaction(async (trx) => {
    const payment = await OutgoingPayment.query(trx).findById(id).forUpdate()
    if (payment.state !== PaymentState.Cancelled) {
      throw new Error(`Cannot quote; payment is in state=${payment.state}`)
    }
    await payment.$query(trx).patch({ state: PaymentState.Inactive })
    return payment
  })
}

async function approvePayment(
  deps: ServiceDependencies,
  id: string
): Promise<OutgoingPayment> {
  return deps.knex.transaction(async (trx) => {
    const payment = await OutgoingPayment.query(trx).findById(id).forUpdate()
    if (payment.state !== PaymentState.Ready) {
      throw new Error(`Cannot approve; payment is in state=${payment.state}`)
    }
    await payment.$query(trx).patch({ state: PaymentState.Activated })
    return payment
  })
}

async function cancelPayment(
  deps: ServiceDependencies,
  id: string
): Promise<OutgoingPayment> {
  return deps.knex.transaction(async (trx) => {
    const payment = await OutgoingPayment.query(trx).findById(id).forUpdate()
    if (payment.state !== PaymentState.Ready) {
      throw new Error(`Cannot cancel; payment is in state=${payment.state}`)
    }
    await payment.$query(trx).patch({
      state: PaymentState.Cancelling,
      error: lifecycle.LifecycleError.CancelledByAPI
    })
    return payment
  })
}
