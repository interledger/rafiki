import { ForeignKeyViolationError, TransactionOrKnex } from 'objection'
import * as Pay from '@interledger/pay'
import { BaseService } from '../shared/baseService'
import { OutgoingPayment, PaymentIntent, PaymentState } from './model'
import {
  AccountingService,
  AccountType,
  AssetAccount,
  SendAccountOptions
} from '../accounting/service'
import { AccountService } from '../open_payments/account/service'
import { RatesService } from '../rates/service'
import { IlpPlugin } from './ilp_plugin'
import * as lifecycle from './lifecycle'
import * as worker from './worker'

export interface OutgoingPaymentService {
  get(id: string): Promise<OutgoingPayment | undefined>
  create(options: CreateOutgoingPaymentOptions): Promise<OutgoingPayment>
  send(id: string): Promise<OutgoingPayment>
  cancel(id: string): Promise<OutgoingPayment>
  requote(id: string): Promise<OutgoingPayment>
  processNext(): Promise<string | undefined>
  getAccountPage(
    accountId: string,
    pagination?: Pagination
  ): Promise<OutgoingPayment[]>
}

const PLACEHOLDER_DESTINATION = {
  code: 'TMP',
  scale: 2
}

export interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  slippage: number
  quoteLifespan: number // milliseconds
  accountingService: AccountingService
  accountService: AccountService
  ratesService: RatesService
  makeIlpPlugin: (sourceAccount: SendAccountOptions) => IlpPlugin
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
    send: (id) => sendPayment(deps, id),
    cancel: (id) => cancelPayment(deps, id),
    requote: (id) => requotePayment(deps, id),
    processNext: () => worker.processPendingPayment(deps),
    getAccountPage: (accountId, pagination) =>
      getAccountPage(deps, accountId, pagination)
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
  accountId: string
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

  try {
    return await OutgoingPayment.transaction(deps.knex, async (trx) => {
      const payment = await OutgoingPayment.query(trx)
        .insertAndFetch({
          state: PaymentState.Quoting,
          intent: {
            paymentPointer: options.paymentPointer,
            invoiceUrl: options.invoiceUrl,
            amountToSend: options.amountToSend,
            autoApprove: options.autoApprove
          },
          accountId: options.accountId,
          destinationAccount: PLACEHOLDER_DESTINATION
        })
        .withGraphFetched('account.asset')

      const plugin = deps.makeIlpPlugin({
        asset: {
          ...payment.account.asset,
          account: AssetAccount.Sent
        }
      })
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

      await payment.$query(trx).patch({
        destinationAccount: {
          scale: destination.destinationAsset.scale,
          code: destination.destinationAsset.code,
          url: destination.accountUrl
        }
      })

      await deps.accountingService.createAccount({
        id: payment.id,
        asset: payment.account.asset,
        type: AccountType.Credit
      })

      return payment
    })
  } catch (err) {
    if (err instanceof ForeignKeyViolationError) {
      throw new Error('outgoing payment account does not exist')
    }
    throw err
  }
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
    await payment.$query(trx).patch({ state: PaymentState.Quoting })
    return payment
  })
}

async function sendPayment(
  deps: ServiceDependencies,
  id: string
): Promise<OutgoingPayment> {
  return deps.knex.transaction(async (trx) => {
    const payment = await OutgoingPayment.query(trx).findById(id).forUpdate()
    if (!payment) throw new Error('payment does not exist')
    if (payment.state !== PaymentState.Ready) {
      throw new Error(`Cannot send; payment is in state=${payment.state}`)
    }
    await payment.$query(trx).patch({ state: PaymentState.Sending })
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
    // TODO: Notify wallet
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
 * @param accountId The accountId of the payments' sending user.
 * @param pagination Pagination - cursors and limits.
 * @returns OutgoingPayment[] An array of payments that form a page.
 */
async function getAccountPage(
  deps: ServiceDependencies,
  accountId: string,
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
      .where({ accountId })
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
      .where({ accountId })
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
    .where({ accountId })
    .orderBy([
      { column: 'createdAt', order: 'asc' },
      { column: 'id', order: 'asc' }
    ])
    .limit(first)
}
