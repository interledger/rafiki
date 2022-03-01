import { ForeignKeyViolationError, TransactionOrKnex } from 'objection'
import * as Pay from '@interledger/pay'

import { Pagination } from '../shared/baseModel'
import { BaseService } from '../shared/baseService'
import { FundingError, LifecycleError } from './errors'
import { OutgoingPayment, PaymentIntent, PaymentState } from './model'
import { AccountingService } from '../accounting/service'
import { AccountService } from '../open_payments/account/service'
import { RatesService } from '../rates/service'
import { IlpPlugin, IlpPluginOptions } from './ilp_plugin'
import * as worker from './worker'

export interface OutgoingPaymentService {
  get(id: string): Promise<OutgoingPayment | undefined>
  create(options: CreateOutgoingPaymentOptions): Promise<OutgoingPayment>
  fund(
    options: FundOutgoingPaymentOptions
  ): Promise<OutgoingPayment | FundingError>
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
  makeIlpPlugin: (options: IlpPluginOptions) => IlpPlugin
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
    fund: (options) => fundPayment(deps, options),
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
    options.incomingPaymentUrl &&
    (options.paymentPointer || options.amountToSend !== undefined)
  ) {
    deps.logger.warn(
      {
        options
      },
      'createOutgoingPayment invalid parameters'
    )
    throw new Error(
      'incomingPaymentUrl and (paymentPointer,amountToSend) are mutually exclusive'
    )
  }

  try {
    return await OutgoingPayment.transaction(deps.knex, async (trx) => {
      const payment = await OutgoingPayment.query(trx)
        .insertAndFetch({
          state: PaymentState.Quoting,
          intent: {
            paymentPointer: options.paymentPointer,
            incomingPaymentUrl: options.incomingPaymentUrl,
            amountToSend: options.amountToSend,
            autoApprove: options.autoApprove
          },
          accountId: options.accountId,
          destinationAccount: PLACEHOLDER_DESTINATION
        })
        .withGraphFetched('account.asset')

      const plugin = deps.makeIlpPlugin({
        sourceAccount: payment,
        unfulfillable: true
      })
      await plugin.connect()
      const destination = await Pay.setupPayment({
        plugin,
        paymentPointer: options.paymentPointer,
        invoiceUrl: options.incomingPaymentUrl
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

      await deps.accountingService.createLiquidityAccount({
        id: payment.id,
        asset: payment.account.asset
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

export interface FundOutgoingPaymentOptions {
  id: string
  amount: bigint
  transferId: string
}

async function fundPayment(
  deps: ServiceDependencies,
  { id, amount, transferId }: FundOutgoingPaymentOptions
): Promise<OutgoingPayment | FundingError> {
  return deps.knex.transaction(async (trx) => {
    const payment = await OutgoingPayment.query(trx)
      .findById(id)
      .forUpdate()
      .withGraphFetched('account.asset')
    if (!payment) return FundingError.UnknownPayment
    if (payment.state !== PaymentState.Funding) {
      return FundingError.WrongState
    }
    if (!payment.quote) throw LifecycleError.MissingQuote
    if (amount !== payment.quote.maxSourceAmount)
      return FundingError.InvalidAmount
    const error = await deps.accountingService.createDeposit({
      id: transferId,
      account: payment,
      amount
    })
    if (error) {
      return error
    }
    await payment.$query(trx).patch({ state: PaymentState.Sending })
    return payment
  })
}

async function getAccountPage(
  deps: ServiceDependencies,
  accountId: string,
  pagination?: Pagination
): Promise<OutgoingPayment[]> {
  return await OutgoingPayment.query(deps.knex)
    .getPage(pagination)
    .where({ accountId })
}
