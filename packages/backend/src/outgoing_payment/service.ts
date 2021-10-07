import { TransactionOrKnex } from 'objection'
import { v4 as uuid } from 'uuid'
import * as Pay from '@interledger/pay'
import { BaseService } from '../shared/baseService'
import { OutgoingPayment, PaymentIntent, PaymentState } from './model'
import { AccountService } from '../account/service'
import { isAccountError } from '../account/errors'
import { BalanceService } from '../balance/service'
import { RatesService } from '../rates/service'
import { TransferService } from '../transfer/service'
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
  balanceService: BalanceService
  ratesService: RatesService
  transferService: TransferService
  makeIlpPlugin: (sourceAccountId: string) => IlpPlugin
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
  return OutgoingPayment.query(deps.knex).findById(id)
}

type CreateOutgoingPaymentOptions = PaymentIntent & { sourceAccountId: string }

// TODO ensure this is idempotent/safe for autoApprove:true payments
async function createOutgoingPayment(
  deps: ServiceDependencies,
  options: CreateOutgoingPaymentOptions
): Promise<OutgoingPayment> {
  if (
    options.invoiceUrl &&
    (options.paymentPointer || options.amountToSend !== undefined)
  ) {
    deps.logger.warn(
      {
        options
      },
      'createOutgoingPayment invalid parameters'
    )
    throw new Error(
      'invoiceUrl and (paymentPointer,amountToSend) are mutually exclusive'
    )
  }

  const plugin = deps.makeIlpPlugin(options.sourceAccountId)
  await plugin.connect()
  const destination = await Pay.setupPayment({
    plugin,
    paymentPointer: options.paymentPointer,
    invoiceUrl: options.invoiceUrl
  }).finally(() => {
    plugin.disconnect().catch((err) => {
      deps.logger.warn({ error: err.message }, 'error disconnecting plugin')
    })
  })

  const sourceAccount = await deps.accountService.get(options.sourceAccountId)
  if (!sourceAccount) {
    throw new Error('outgoing payment source account does not exist')
  }
  const account = await deps.accountService.create({
    asset: sourceAccount.asset
  })
  if (isAccountError(account)) {
    deps.logger.warn(
      {
        sourceAccountId: options.sourceAccountId,
        error: sourceAccount
      },
      'createOutgoingPayment account creation failed'
    )
    throw new Error('unable to create account, err=' + account)
  }
  const reservedBalanceId = uuid()
  const error = await deps.balanceService.create([
    {
      id: reservedBalanceId,
      unit: sourceAccount.asset.unit
    }
  ])
  if (error) {
    deps.logger.warn(
      {
        error: error[0].error
      },
      'createOutgoingPayment reserved balance creation failed'
    )
    throw new Error('unable to create reserved balance, err=' + error[0].error)
  }

  return await OutgoingPayment.query(deps.knex).insertAndFetch({
    state: PaymentState.Inactive,
    intent: {
      paymentPointer: options.paymentPointer,
      invoiceUrl: options.invoiceUrl,
      amountToSend: options.amountToSend,
      autoApprove: options.autoApprove
    },
    accountId: account.id,
    reservedBalanceId,
    sourceAccount: {
      id: options.sourceAccountId,
      code: sourceAccount.asset.code,
      scale: sourceAccount.asset.scale
    },
    destinationAccount: {
      scale: destination.destinationAsset.scale,
      code: destination.destinationAsset.code,
      url: destination.accountUrl
    }
  })
}

function requotePayment(
  deps: ServiceDependencies,
  id: string
): Promise<OutgoingPayment> {
  return deps.knex.transaction(async (trx) => {
    const payment = await OutgoingPayment.query(trx).findById(id).forUpdate()
    if (!payment) throw new Error('payment does not exist')
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
    if (!payment) throw new Error('payment does not exist')
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
    if (!payment) throw new Error('payment does not exist')
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
