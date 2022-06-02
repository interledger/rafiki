import { ForeignKeyViolationError, TransactionOrKnex } from 'objection'

import { Pagination } from '../../../shared/baseModel'
import { BaseService } from '../../../shared/baseService'
import {
  FundingError,
  OutgoingPaymentError,
  isOutgoingPaymentError
} from './errors'
import {
  OutgoingPayment,
  OutgoingPaymentState,
  PaymentEventType
} from './model'
import { AccountingService } from '../../../accounting/service'
import { AccountService } from '../../account/service'
import { IlpPlugin, IlpPluginOptions } from '../../../shared/ilp_plugin'
import { sendWebhookEvent } from './lifecycle'
import * as worker from './worker'

export interface OutgoingPaymentService {
  get(id: string): Promise<OutgoingPayment | undefined>
  create(
    options: CreateOutgoingPaymentOptions
  ): Promise<OutgoingPayment | OutgoingPaymentError>
  fund(
    options: FundOutgoingPaymentOptions
  ): Promise<OutgoingPayment | FundingError>
  processNext(): Promise<string | undefined>
  getAccountPage(
    accountId: string,
    pagination?: Pagination
  ): Promise<OutgoingPayment[]>
}

export interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  accountingService: AccountingService
  accountService: AccountService
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
  const outgoingPayment = await OutgoingPayment.query(deps.knex)
    .findById(id)
    .withGraphJoined('quote.asset')
  if (outgoingPayment) return await addSentAmount(deps, outgoingPayment)
  else return
}

export interface CreateOutgoingPaymentOptions {
  accountId: string
  quoteId: string
  description?: string
  externalRef?: string
}

async function createOutgoingPayment(
  deps: ServiceDependencies,
  options: CreateOutgoingPaymentOptions
): Promise<OutgoingPayment | OutgoingPaymentError> {
  try {
    return await OutgoingPayment.transaction(deps.knex, async (trx) => {
      const payment = await OutgoingPayment.query(trx)
        .insertAndFetch({
          id: options.quoteId,
          accountId: options.accountId,
          description: options.description,
          externalRef: options.externalRef,
          state: OutgoingPaymentState.Funding
        })
        .withGraphFetched('[quote.asset]')

      if (
        payment.accountId !== payment.quote.accountId ||
        payment.quote.expiresAt.getTime() <= payment.createdAt.getTime()
      ) {
        throw OutgoingPaymentError.InvalidQuote
      }

      // TODO: move to fundPayment
      await deps.accountingService.createLiquidityAccount({
        id: payment.id,
        asset: payment.asset
      })
      await sendWebhookEvent(
        {
          ...deps,
          knex: trx
        },
        payment,
        PaymentEventType.PaymentCreated
      )
      return await addSentAmount(deps, payment, BigInt(0))
    })
  } catch (err) {
    if (err instanceof ForeignKeyViolationError) {
      if (err.constraint === 'outgoingpayments_id_foreign') {
        return OutgoingPaymentError.UnknownQuote
      } else if (err.constraint === 'outgoingpayments_accountid_foreign') {
        return OutgoingPaymentError.UnknownAccount
      }
    } else if (isOutgoingPaymentError(err)) {
      return err
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
      .withGraphFetched('[quote.asset]')
    if (!payment) return FundingError.UnknownPayment
    if (payment.state !== OutgoingPaymentState.Funding) {
      return FundingError.WrongState
    }
    if (amount !== payment.sendAmount.value) return FundingError.InvalidAmount
    const error = await deps.accountingService.createDeposit({
      id: transferId,
      account: payment,
      amount
    })
    if (error) {
      return error
    }
    await payment.$query(trx).patch({ state: OutgoingPaymentState.Sending })
    return await addSentAmount(deps, payment)
  })
}

async function getAccountPage(
  deps: ServiceDependencies,
  accountId: string,
  pagination?: Pagination
): Promise<OutgoingPayment[]> {
  const page = await OutgoingPayment.query(deps.knex)
    .getPage(pagination)
    .where({
      accountId
    })
    .withGraphFetched('quote.asset')

  const amounts = await deps.accountingService.getAccountsTotalSent(
    page.map((payment: OutgoingPayment) => payment.id)
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  return page.map((payment: OutgoingPayment, i: number) => {
    try {
      payment.sentAmount = {
        value: BigInt(amounts[i]),
        assetCode: payment.asset.code,
        assetScale: payment.asset.scale
      }
    } catch (_) {
      deps.logger.error({ payment: payment.id }, 'account not found')
      throw new Error(
        `Underlying TB account not found, payment id: ${payment.id}`
      )
    }
    return payment
  })
}

async function addSentAmount(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  value?: bigint
): Promise<OutgoingPayment> {
  const received =
    value || (await deps.accountingService.getTotalSent(payment.id))
  if (received !== undefined) {
    payment.sentAmount = {
      value: received,
      assetCode: payment.asset.code,
      assetScale: payment.asset.scale
    }
  } else {
    deps.logger.error({ outgoingPayment: payment.id }, 'account not found')
    throw new Error(
      `Underlying TB account not found, payment id: ${payment.id}`
    )
  }
  return payment
}
