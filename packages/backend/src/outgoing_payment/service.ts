import { TransactionOrKnex } from 'objection'
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
  getAccountPage(
    sourceAccountId: string,
    pagination?: Pagination
  ): Promise<OutgoingPayment[]>
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
    processNext: () => worker.processPendingPayment(deps),
    getAccountPage: (sourceAccountId, pagination) =>
      getAccountPage(deps, sourceAccountId, pagination)
  }
}

async function getOutgoingPayment(
  deps: ServiceDependencies,
  id: string
): Promise<OutgoingPayment | undefined> {
  return OutgoingPayment.query(deps.knex)
    .findById(id)
    .withGraphJoined('account.asset')
}

type CreateOutgoingPaymentOptions = PaymentIntent & {
  sourceAccountId: string
  assetId: string
}

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

  const account = await deps.accountService.create({
    assetId: options.assetId,
    sentBalance: true
  })
  if (isAccountError(account)) {
    deps.logger.warn(
      {
        ...options,
        error: account
      },
      'createOutgoingPayment account creation failed'
    )
    throw new Error('unable to create account, err=' + account)
  }

  return await OutgoingPayment.query(deps.knex)
    .insertAndFetch({
      state: PaymentState.Inactive,
      intent: {
        paymentPointer: options.paymentPointer,
        invoiceUrl: options.invoiceUrl,
        amountToSend: options.amountToSend,
        autoApprove: options.autoApprove
      },
      accountId: account.id,
      sourceAccountId: options.sourceAccountId,
      destinationAccount: {
        scale: destination.destinationAsset.scale,
        code: destination.destinationAsset.code,
        url: destination.accountUrl
      }
    })
    .withGraphFetched('account.asset')
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
    await payment.$query(trx).patch({ state: PaymentState.Funding })
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
      state: PaymentState.Cancelled,
      error: lifecycle.LifecycleError.CancelledByAPI
    })
    return payment
  })
}

interface Pagination {
  after?: string // Forward pagination: cursor.
  before?: string // Backward pagination: cursor.
  first?: number // Forward pagination: limit.
  last?: number // Backward pagination: limit.
}

/**
 * The pagination algorithm is based on the Relay connection specification.
 * Please read the spec before changing things:
 * https://relay.dev/graphql/connections.htm
 * @param deps ServiceDependencies.
 * @param sourceAccountId The accountId of the payments' user (not of the payment itself).
 * @param pagination Pagination - cursors and limits.
 * @returns OutgoingPayment[] An array of payments that form a page.
 */
async function getAccountPage(
  deps: ServiceDependencies,
  sourceAccountId: string,
  pagination?: Pagination
): Promise<OutgoingPayment[]> {
  if (
    typeof pagination?.before === 'undefined' &&
    typeof pagination?.last === 'number'
  ) {
    throw new Error("Can't paginate backwards from the start.")
  }

  const first = pagination?.first || 20
  if (first < 0 || first > 100) throw new Error('Pagination index error')
  const last = pagination?.last || 20
  if (last < 0 || last > 100) throw new Error('Pagination index error')

  /**
   * Forward pagination
   */
  if (typeof pagination?.after === 'string') {
    return OutgoingPayment.query(deps.knex)
      .where({ sourceAccountId })
      .andWhereRaw(
        '("createdAt", "id") > (select "createdAt" :: TIMESTAMP, "id" from "outgoingPayments" where "id" = ?)',
        [pagination.after]
      )
      .orderBy([
        { column: 'createdAt', order: 'asc' },
        { column: 'id', order: 'asc' }
      ])
      .limit(first)
  }

  /**
   * Backward pagination
   */
  if (typeof pagination?.before === 'string') {
    return OutgoingPayment.query(deps.knex)
      .where({ sourceAccountId })
      .andWhereRaw(
        '("createdAt", "id") < (select "createdAt" :: TIMESTAMP, "id" from "outgoingPayments" where "id" = ?)',
        [pagination.before]
      )
      .orderBy([
        { column: 'createdAt', order: 'desc' },
        { column: 'id', order: 'desc' }
      ])
      .limit(last)
      .then((resp) => {
        return resp.reverse()
      })
  }

  return OutgoingPayment.query(deps.knex)
    .where({ sourceAccountId })
    .orderBy([
      { column: 'createdAt', order: 'asc' },
      { column: 'id', order: 'asc' }
    ])
    .limit(first)
}
