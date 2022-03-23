import {
  ForeignKeyViolationError,
  TransactionOrKnex,
  PartialModelObject
} from 'objection'

import { Pagination } from '../../../shared/baseModel'
import { BaseService } from '../../../shared/baseService'
import { FundingError, LifecycleError, OutgoingPaymentError } from './errors'
import { sendWebhookEvent } from './lifecycle'
import {
  OutgoingPayment,
  PaymentAmount,
  PaymentState,
  PaymentEventType
} from './model'
import { AccountingService } from '../../../accounting/service'
import { AccountService } from '../../account/service'
import { RatesService } from '../../../rates/service'
import { IlpPlugin, IlpPluginOptions } from './ilp_plugin'
import * as worker from './worker'

export interface OutgoingPaymentService {
  get(id: string): Promise<OutgoingPayment | undefined>
  create(
    options: CreateOutgoingPaymentOptions
  ): Promise<OutgoingPayment | OutgoingPaymentError>
  update(
    options: UpdateOutgoingPaymentOptions
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
    update: (options) => updatePayment(deps, options),
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

export interface CreateOutgoingPaymentOptions {
  accountId: string
  authorized?: boolean
  sendAmount?: PaymentAmount
  receiveAmount?: PaymentAmount
  receivingAccount?: string
  receivingPayment?: string
  description?: string
  externalRef?: string
}

async function createOutgoingPayment(
  deps: ServiceDependencies,
  options: CreateOutgoingPaymentOptions
): Promise<OutgoingPayment | OutgoingPaymentError> {
  if (options.receivingPayment) {
    if (options.receivingAccount) {
      return OutgoingPaymentError.InvalidDestination
    }
    if (options.sendAmount || options.receiveAmount) {
      return OutgoingPaymentError.InvalidAmount
    }
  } else if (options.receivingAccount) {
    if (options.sendAmount) {
      if (options.receiveAmount || options.sendAmount.amount <= BigInt(0)) {
        return OutgoingPaymentError.InvalidAmount
      }
    } else if (
      !options.receiveAmount ||
      options.receiveAmount.amount <= BigInt(0)
    ) {
      return OutgoingPaymentError.InvalidAmount
    }
  } else {
    return OutgoingPaymentError.InvalidDestination
  }

  try {
    const account = await deps.accountService.get(options.accountId)
    if (!account) {
      return OutgoingPaymentError.UnknownAccount
    }
    if (options.sendAmount) {
      if (options.sendAmount.assetCode || options.sendAmount.assetScale) {
        if (
          options.sendAmount.assetCode !== account.asset.code ||
          options.sendAmount.assetScale !== account.asset.scale
        ) {
          return OutgoingPaymentError.InvalidAmount
        }
      }
      ;(options.sendAmount.assetCode = account.asset.code),
        (options.sendAmount.assetScale = account.asset.scale)
    }

    return await OutgoingPayment.transaction(deps.knex, async (trx) => {
      const payment = await OutgoingPayment.query(trx)
        .insertAndFetch({
          ...options,
          state: PaymentState.Pending
        })
        .withGraphFetched('account.asset')

      await deps.accountingService.createLiquidityAccount({
        id: payment.id,
        asset: payment.account.asset
      })

      return payment
    })
  } catch (err) {
    if (err instanceof ForeignKeyViolationError) {
      return OutgoingPaymentError.UnknownAccount
    }
    throw err
  }
}

export interface UpdateOutgoingPaymentOptions {
  id: string
  authorized?: boolean
  sendAmount?: PaymentAmount
  receiveAmount?: PaymentAmount
  state?: PaymentState
}

async function updatePayment(
  deps: ServiceDependencies,
  {
    id,
    authorized,
    sendAmount,
    receiveAmount,
    state
  }: UpdateOutgoingPaymentOptions
): Promise<OutgoingPayment | OutgoingPaymentError> {
  // TODO: introspect access token
  if (!sendAmount && !receiveAmount) {
    if (!authorized) {
      return OutgoingPaymentError.InvalidAmount
    } else if (state) {
      return OutgoingPaymentError.InvalidState
    }
  } else if (sendAmount && receiveAmount) {
    return OutgoingPaymentError.InvalidAmount
  } else if (state && state !== PaymentState.Pending) {
    return OutgoingPaymentError.InvalidState
  }
  if (authorized !== undefined && authorized !== true) {
    return OutgoingPaymentError.InvalidAuthorized
  }
  return deps.knex.transaction(async (trx) => {
    const payment = await OutgoingPayment.query(trx)
      .findById(id)
      .forUpdate()
      .withGraphFetched('account.asset')
    if (!payment) return OutgoingPaymentError.UnknownPayment

    if (sendAmount || receiveAmount) {
      const update: PartialModelObject<OutgoingPayment> = {}
      switch (payment.state) {
        case PaymentState.Pending:
        case PaymentState.Prepared:
        case PaymentState.Expired:
          update.state = PaymentState.Pending
          update.expiresAt = null
          break
        default:
          return OutgoingPaymentError.WrongState
      }

      if (sendAmount) {
        if (sendAmount.assetCode || sendAmount.assetScale) {
          if (
            sendAmount.assetCode !== payment.account.asset.code ||
            sendAmount.assetScale !== payment.account.asset.scale
          ) {
            return OutgoingPaymentError.InvalidAmount
          }
        }
        update.sendAmount = {
          amount: sendAmount.amount,
          assetCode: payment.account.asset.code,
          assetScale: payment.account.asset.scale
        }
        update.receiveAmount = null
      } else {
        update.receiveAmount = receiveAmount
        update.sendAmount = null
      }
      await payment.$query(trx).patch(update)
    }
    if (authorized) {
      const update: PartialModelObject<OutgoingPayment> = {
        authorized
      }
      if (payment.state === PaymentState.Prepared) {
        update.state = PaymentState.Funding
        await sendWebhookEvent(
          {
            ...deps,
            knex: trx
          },
          payment,
          PaymentEventType.PaymentFunding
        )
      } else if (payment.state !== PaymentState.Pending || payment.authorized) {
        return OutgoingPaymentError.WrongState
      }
      await payment.$query(trx).patch(update)
    }
    return payment
  })
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
    if (!payment.sendAmount) throw LifecycleError.MissingSendAmount
    if (amount !== payment.sendAmount.amount) return FundingError.InvalidAmount
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
