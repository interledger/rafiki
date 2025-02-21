import {
  ForeignKeyViolationError,
  TransactionOrKnex,
  UniqueViolationError
} from 'objection'

import { BaseService } from '../../../shared/baseService'
import {
  FundingError,
  isOutgoingPaymentError,
  OutgoingPaymentError,
  quoteErrorToOutgoingPaymentError
} from './errors'
import { Limits, getInterval } from './limits'
import {
  OutgoingPayment,
  OutgoingPaymentGrant,
  OutgoingPaymentState,
  OutgoingPaymentEventType
} from './model'
import { Grant } from '../../auth/middleware'
import {
  AccountingService,
  LiquidityAccountType
} from '../../../accounting/service'
import { PeerService } from '../../../payment-method/ilp/peer/service'
import { ReceiverService } from '../../receiver/service'
import { GetOptions, ListOptions } from '../../wallet_address/model'
import {
  WalletAddressService,
  WalletAddressSubresourceService
} from '../../wallet_address/service'
import { sendWebhookEvent } from './lifecycle'
import * as worker from './worker'
import { Interval } from 'luxon'
import { knex } from 'knex'
import { AccountAlreadyExistsError } from '../../../accounting/errors'
import { PaymentMethodHandlerService } from '../../../payment-method/handler/service'
import { TelemetryService } from '../../../telemetry/service'
import { Amount } from '../../amount'
import { QuoteService } from '../../quote/service'
import { isQuoteError } from '../../quote/errors'
import { Pagination, SortOrder } from '../../../shared/baseModel'
import { FilterString } from '../../../shared/filters'
import { Config, IAppConfig } from '../../../config/app'
import { AssetService } from '../../../asset/service'

import { Queue } from 'bullmq'

const queue = new Queue('OP', { connection: { url: Config.redisUrl } })

export interface OutgoingPaymentService
  extends WalletAddressSubresourceService<OutgoingPayment> {
  getPage(options?: GetPageOptions): Promise<OutgoingPayment[]>
  create(
    options: CreateOutgoingPaymentOptions
  ): Promise<OutgoingPayment | OutgoingPaymentError>
  cancel(
    options: CancelOutgoingPaymentOptions
  ): Promise<OutgoingPayment | OutgoingPaymentError>
  fund(
    options: FundOutgoingPaymentOptions
  ): Promise<OutgoingPayment | FundingError>
  processNext(payment: any): Promise<string | undefined>
}

export interface ServiceDependencies extends BaseService {
  config: IAppConfig
  knex: TransactionOrKnex
  accountingService: AccountingService
  receiverService: ReceiverService
  peerService: PeerService
  paymentMethodHandlerService: PaymentMethodHandlerService
  walletAddressService: WalletAddressService
  quoteService: QuoteService
  assetService: AssetService
  telemetry: TelemetryService
}

export async function createOutgoingPaymentService(
  deps_: ServiceDependencies
): Promise<OutgoingPaymentService> {
  const deps = {
    ...deps_,
    logger: deps_.logger.child({ service: 'OutgoingPaymentService' })
  }
  return {
    get: (options) => getOutgoingPayment(deps, options),
    getPage: (options) => getOutgoingPaymentsPage(deps, options),
    create: (options) => createOutgoingPayment(deps, options),
    cancel: (options) => cancelOutgoingPayment(deps, options),
    fund: (options) => fundPayment(deps, options),
    // fund: (options) => fundPayment2(deps, options),
    processNext: (payment) => worker.processPendingPayment(deps, payment),
    getWalletAddressPage: (options) => getWalletAddressPage(deps, options)
  }
}

interface OutgoingPaymentFilter {
  receiver?: FilterString
  walletAddressId?: FilterString
  state?: FilterString
}

interface GetPageOptions {
  pagination?: Pagination
  filter?: OutgoingPaymentFilter
  sortOrder?: SortOrder
}

async function getOutgoingPaymentsPage(
  deps: ServiceDependencies,
  options?: GetPageOptions
): Promise<OutgoingPayment[]> {
  const { filter, pagination, sortOrder } = options ?? {}

  const query = OutgoingPayment.query(deps.knex).withGraphFetched('quote')

  if (filter?.receiver?.in && filter.receiver.in.length) {
    query
      .innerJoin('quotes', 'quotes.id', 'outgoingPayments.id')
      .whereIn('quotes.receiver', filter.receiver.in)
  }

  if (filter?.walletAddressId?.in && filter.walletAddressId.in.length) {
    query.whereIn('walletAddressId', filter.walletAddressId.in)
  }

  if (filter?.state?.in && filter.state.in.length) {
    query.whereIn('state', filter.state.in)
  }

  const page = await query.getPage(pagination, sortOrder)
  for (const payment of page) {
    payment.walletAddress = await deps.walletAddressService.get(
      payment.walletAddressId
    )
    const asset = await deps.assetService.get(payment.quote.assetId)
    if (asset) payment.quote.asset = asset
  }

  const amounts = await deps.accountingService.getAccountsTotalSent(
    page.map((payment: OutgoingPayment) => payment.id)
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  return page.map((payment: OutgoingPayment, i: number) => {
    payment.sentAmount = {
      value: validateSentAmount(deps, payment, amounts[i]),
      assetCode: payment.asset.code,
      assetScale: payment.asset.scale
    }
    return payment
  })
}

async function getOutgoingPayment(
  deps: ServiceDependencies,
  options: GetOptions
): Promise<OutgoingPayment | undefined> {
  const outgoingPayment = await OutgoingPayment.query(deps.knex)
    .get(options)
    .withGraphFetched('quote')
  if (outgoingPayment) {
    outgoingPayment.walletAddress = await deps.walletAddressService.get(
      outgoingPayment.walletAddressId
    )
    const asset = await deps.assetService.get(outgoingPayment.quote.assetId)
    if (asset) outgoingPayment.quote.asset = asset

    return addSentAmount(deps, outgoingPayment)
  }
}

export interface BaseOptions {
  walletAddressId: string
  client?: string
  grant?: Grant
  metadata?: Record<string, unknown>
  callback?: (f: unknown) => NodeJS.Timeout
  grantLockTimeoutMs?: number
}
export interface CreateFromQuote extends BaseOptions {
  quoteId: string
}
export interface CreateFromIncomingPayment extends BaseOptions {
  incomingPayment: string
  debitAmount: Amount
}

export type CancelOutgoingPaymentOptions = {
  id: string
  reason?: string
}

export type CreateOutgoingPaymentOptions =
  | CreateFromQuote
  | CreateFromIncomingPayment

export function isCreateFromIncomingPayment(
  options: CreateOutgoingPaymentOptions
): options is CreateFromIncomingPayment {
  return 'incomingPayment' in options && 'debitAmount' in options
}

async function cancelOutgoingPayment(
  deps: ServiceDependencies,
  options: CancelOutgoingPaymentOptions
): Promise<OutgoingPayment | OutgoingPaymentError> {
  const { id } = options

  return deps.knex.transaction(async (trx) => {
    let payment = await OutgoingPayment.query(trx).findById(id).forUpdate()

    if (!payment) return OutgoingPaymentError.UnknownPayment
    if (payment.state !== OutgoingPaymentState.Funding) {
      return OutgoingPaymentError.WrongState
    }

    payment = await payment
      .$query(trx)
      .patchAndFetch({
        state: OutgoingPaymentState.Cancelled,
        metadata: {
          ...payment.metadata,
          ...(options.reason ? { cancellationReason: options.reason } : {})
        }
      })
      .withGraphFetched('quote')
    const asset = await deps.assetService.get(payment.quote.assetId)
    if (asset) payment.quote.asset = asset

    payment.walletAddress = await deps.walletAddressService.get(
      payment.walletAddressId
    )

    return addSentAmount(deps, payment)
  })
}

async function createOutgoingPayment(
  deps: ServiceDependencies,
  options: CreateOutgoingPaymentOptions
): Promise<OutgoingPayment | OutgoingPaymentError> {
  const stopTimerOP = deps.telemetry.startTimer(
    'outgoing_payment_service_create_time_ms',
    {
      callName: 'OutgoingPaymentService:create',
      description: 'Time to create an outgoing payment'
    }
  )
  const { walletAddressId } = options
  let quoteId: string

  if (isCreateFromIncomingPayment(options)) {
    const stopTimerQuote = deps.telemetry.startTimer(
      'outgoing_payment_service_create_quote_time_ms',
      {
        callName: 'QuoteService:create',
        description: 'Time to create a quote in outgoing payment'
      }
    )
    const { debitAmount, incomingPayment } = options
    const quoteOrError = await deps.quoteService.create({
      receiver: incomingPayment,
      debitAmount,
      method: 'ilp',
      walletAddressId
    })
    stopTimerQuote()

    if (isQuoteError(quoteOrError)) {
      return quoteErrorToOutgoingPaymentError[quoteOrError]
    }
    quoteId = quoteOrError.id
  } else {
    quoteId = options.quoteId
  }

  const grantId = options.grant?.id
  try {
    // TODO: rm deps.knex?
    return await OutgoingPayment.transaction(async (trx) => {
      // return await OutgoingPayment.transaction(deps.knex, async (trx) => {
      const stopTimerWA = deps.telemetry.startTimer(
        'outgoing_payment_service_getwalletaddress_time_ms',
        {
          callName: 'WalletAddressService:get',
          description: 'Time to get wallet address in outgoing payment'
        }
      )
      const walletAddress = await deps.walletAddressService.get(walletAddressId)
      stopTimerWA()
      if (!walletAddress) {
        throw OutgoingPaymentError.UnknownWalletAddress
      }
      if (!walletAddress.isActive) {
        throw OutgoingPaymentError.InactiveWalletAddress
      }

      if (grantId) {
        const stopTimerGrant = deps.telemetry.startTimer(
          'outgoing_payment_service_insertgrant_time_ms',
          {
            callName: 'OutgoingPaymentGrantModel:insert',
            description: 'Time to insert grant in outgoing payment'
          }
        )
        await OutgoingPaymentGrant.query(trx)
          .insert({
            id: grantId
          })
          .onConflict('id')
          .ignore()
        stopTimerGrant()
      }
      const stopTimerInsertPayment = deps.telemetry.startTimer(
        'outgoing_payment_service_insertpayment_time_ms',
        {
          callName: 'OutgoingPayment.insert',
          description: 'Time to insert payment in outgoing payment'
        }
      )
      const payment = await OutgoingPayment.query(trx)
        .insertAndFetch({
          id: quoteId,
          walletAddressId: walletAddressId,
          client: options.client,
          metadata: options.metadata,
          state: OutgoingPaymentState.Funding,
          grantId
        })
        .withGraphFetched('quote')
      payment.walletAddress = await deps.walletAddressService.get(
        payment.walletAddressId
      )
      const asset = await deps.assetService.get(payment.quote.assetId)
      if (asset) payment.quote.asset = asset

      stopTimerInsertPayment()

      if (
        payment.walletAddressId !== payment.quote.walletAddressId ||
        payment.quote.expiresAt.getTime() <= payment.createdAt.getTime()
      ) {
        throw OutgoingPaymentError.InvalidQuote
      }

      if (options.grant) {
        const stopTimerValidateGrant = deps.telemetry.startTimer(
          'outgoing_payment_service_validate_grant_time_ms',
          {
            callName:
              'OutgoingPaymentService:validateGrantAndAddSpentAmountsToPayment',
            description: 'Time to validate a grant'
          }
        )
        const isValid = await validateGrantAndAddSpentAmountsToPayment(
          deps,
          payment,
          options.grant,
          trx,
          options.callback,
          options.grantLockTimeoutMs
        )
        stopTimerValidateGrant()
        if (!isValid) {
          throw OutgoingPaymentError.InsufficientGrant
        }
      }
      const stopTimerReceiver = deps.telemetry.startTimer(
        'outgoing_payment_service_getreceiver_time_ms',
        {
          callName: 'ReceiverService:get',
          description: 'Time to retrieve receiver in outgoing payment'
        }
      )
      const receiver = await deps.receiverService.get(payment.receiver)
      stopTimerReceiver()
      if (!receiver) {
        throw OutgoingPaymentError.InvalidQuote
      }
      const stopTimerPeer = deps.telemetry.startTimer(
        'outgoing_payment_service_getpeer_time_ms',
        {
          callName: 'PeerService:getByDestinationAddress',
          description: 'Time to retrieve peer in outgoing payment'
        }
      )
      const peer = await deps.peerService.getByDestinationAddress(
        receiver.ilpAddress
      )
      stopTimerPeer()

      const stopTimerPeerUpdate = deps.telemetry.startTimer(
        'outgoing_payment_service_patchpeer_time_ms',
        {
          callName: 'OutgoingPaymentModel:patch',
          description: 'Time to patch peer in outgoing payment'
        }
      )
      if (peer) await payment.$query(trx).patch({ peerId: peer.id })
      stopTimerPeerUpdate()

      const stopTimerWebhook = deps.telemetry.startTimer(
        'outgoing_payment_service_webhook_event_time_ms',
        {
          callName: 'OutgoingPaymentService:sendWebhookEvent',
          description: 'Time to add outgoing payment webhook event'
        }
      )
      await sendWebhookEvent(
        deps,
        payment,
        OutgoingPaymentEventType.PaymentCreated,
        trx
      )
      stopTimerWebhook()

      const stopTimerAddAmount = deps.telemetry.startTimer(
        'outgoing_payment_service_add_sent_time_ms',
        {
          callName: 'OutgoingPaymentService:addSentAmount',
          description: 'Time to add sent amount to outgoing payment'
        }
      )

      const paymentWithSentAmount = await addSentAmount(
        deps,
        payment,
        BigInt(0)
      )

      stopTimerAddAmount()

      return paymentWithSentAmount
    })
  } catch (err) {
    if (err instanceof UniqueViolationError) {
      if (err.constraint === 'outgoingPayments_pkey') {
        return OutgoingPaymentError.InvalidQuote
      }
    } else if (err instanceof ForeignKeyViolationError) {
      if (err.constraint === 'outgoingpayments_id_foreign') {
        return OutgoingPaymentError.UnknownQuote
      } else if (
        err.constraint === 'outgoingpayments_walletaddressid_foreign'
      ) {
        return OutgoingPaymentError.UnknownWalletAddress
      }
    } else if (isOutgoingPaymentError(err)) {
      return err
    } else if (err instanceof knex.KnexTimeoutError) {
      deps.logger.error(
        { grant: grantId },
        'Could not create outgoing payment: grant locked'
      )
    }
    throw err
  } finally {
    stopTimerOP()
  }
}

function validateAccessLimits(
  payment: OutgoingPayment,
  limits: Limits
): PaymentLimits | undefined {
  if (
    (!limits.receiver || payment.receiver === limits?.receiver) &&
    validateAmountAssets(payment, limits)
  ) {
    let paymentInterval: Interval | undefined
    if (limits.interval)
      paymentInterval = getInterval(limits.interval, payment.createdAt)
    if (!limits.interval || !!paymentInterval) {
      return { ...limits, paymentInterval }
    }
  }
}

function validatePaymentInterval({
  limits,
  payment
}: {
  limits: PaymentLimits
  payment: OutgoingPayment
}): boolean {
  return (
    !limits.paymentInterval ||
    (limits.paymentInterval.start !== null &&
      limits.paymentInterval.start.toMillis() <= payment.createdAt.getTime() &&
      limits.paymentInterval.end !== null &&
      payment.createdAt.getTime() < limits.paymentInterval.end.toMillis())
  )
}

function validateAmountAssets(
  payment: OutgoingPayment,
  limits: Limits
): boolean {
  if (
    limits.debitAmount &&
    (limits.debitAmount.assetCode !== payment.asset.code ||
      limits.debitAmount.assetScale !== payment.asset.scale)
  ) {
    return false
  }
  return (
    !limits.receiveAmount ||
    (limits.receiveAmount.assetCode === payment.receiveAmount.assetCode &&
      limits.receiveAmount.assetScale === payment.receiveAmount.assetScale)
  )
}

interface PaymentLimits extends Limits {
  paymentInterval?: Interval
}

// "payment" is locked by the "deps.knex" transaction.
async function validateGrantAndAddSpentAmountsToPayment(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  grant: Grant,
  trx: TransactionOrKnex,
  callback?: (f: unknown) => NodeJS.Timeout,
  grantLockTimeoutMs: number = 5000
): Promise<boolean> {
  if (!grant.limits) {
    return true
  }
  const paymentLimits = validateAccessLimits(payment, grant.limits)
  if (!paymentLimits) {
    return false
  }
  if (!paymentLimits.debitAmount && !paymentLimits.receiveAmount) {
    return true
  }

  if (
    (paymentLimits.debitAmount &&
      paymentLimits.debitAmount.value < payment.debitAmount.value) ||
    (paymentLimits.receiveAmount &&
      paymentLimits.receiveAmount.value < payment.receiveAmount.value)
  ) {
    // Payment amount single-handedly exceeds amount limit
    return false
  }

  await OutgoingPaymentGrant.query(trx)
    // || deps.knex unused? although it doesnt seem to make a difference either way
    // await OutgoingPaymentGrant.query(trx || deps.knex)
    .where('id', grant.id)
    .forNoKeyUpdate()
    .timeout(grantLockTimeoutMs)

  if (callback) await new Promise(callback)

  const grantPayments = await OutgoingPayment.query(trx)
    // || deps.knex unused? although it doesnt seem to make a difference either way
    // const grantPayments = await OutgoingPayment.query(trx || deps.knex)
    .where({
      grantId: grant.id
    })
    .andWhereNot({
      id: payment.id
    })
    .withGraphFetched('quote')

  if (grantPayments.length === 0) {
    return true
  }

  const amounts = {
    sent: {
      assetCode: payment.asset.code,
      assetScale: payment.asset.scale,
      value: BigInt(0)
    },
    received: {
      assetCode: payment.receiveAmount.assetCode,
      assetScale: payment.receiveAmount.assetScale,
      value: BigInt(0)
    }
  }
  for (const grantPayment of grantPayments) {
    const asset = await deps.assetService.get(grantPayment.quote.assetId)
    if (asset) grantPayment.quote.asset = asset

    if (
      validatePaymentInterval({
        limits: paymentLimits,
        payment: grantPayment
      })
    ) {
      if (grantPayment.failed) {
        const totalSent = validateSentAmount(
          deps,
          payment,
          await deps.accountingService.getTotalSent(grantPayment.id)
        )

        if (totalSent === BigInt(0)) {
          continue
        }
        amounts.sent.value += totalSent
        // Estimate delivered amount of failed payment
        amounts.received.value +=
          (grantPayment.receiveAmount.value * totalSent) /
          grantPayment.debitAmount.value
      } else {
        amounts.sent.value += grantPayment.debitAmount.value
        amounts.received.value += grantPayment.receiveAmount.value
      }
    }
  }
  if (
    (paymentLimits.debitAmount &&
      paymentLimits.debitAmount.value - amounts.sent.value <
        payment.debitAmount.value) ||
    (paymentLimits.receiveAmount &&
      paymentLimits.receiveAmount.value - amounts.received.value <
        payment.receiveAmount.value)
  ) {
    payment.grantSpentDebitAmount = amounts.sent
    payment.grantSpentReceiveAmount = amounts.received
    return false
  }
  payment.grantSpentDebitAmount = amounts.sent
  payment.grantSpentReceiveAmount = amounts.received
  return true
}

export interface FundOutgoingPaymentOptions {
  id: string
  amount: bigint
  transferId: string
}

// -removed transction, forUpdate lock, and state update
//   - should not be necessary since worker no longer needs state to find
//     op to process.
// - added queue
async function fundPayment(
  deps: ServiceDependencies,
  { id, amount, transferId }: FundOutgoingPaymentOptions
): Promise<OutgoingPayment | FundingError> {
  const stopTimerFund = deps.telemetry.startTimer(
    'outgoing_payment_service_fund_time_ms',
    {
      callName: 'OutgoingPaymentService:fundPayment',
      description: 'Time to fund an outgoing payment'
    }
  )
  // return await deps.knex.transaction(async (trx) => {
  const stopTimerGet = deps.telemetry.startTimer(
    'outgoing_payment_service_fund_get_time_ms',
    {
      callName: 'OutgoingPaymentService:fundPayment:get',
      description: 'Time to get outgoing payment'
    }
  )
  const payment = await OutgoingPayment.query()
    // const payment = await OutgoingPayment.query(trx)
    .findById(id)
    // .forUpdate()
    .withGraphFetched('quote')
  stopTimerGet()
  if (!payment) {
    stopTimerFund()
    return FundingError.UnknownPayment
  }

  const stopTimerAssetGet = deps.telemetry.startTimer(
    'outgoing_payment_service_fund_asset_get_time_ms',
    {
      callName: 'OutgoingPaymentService:fundPayment:getAsset',
      description: 'Time to get asset for outgoing payment'
    }
  )
  const asset = await deps.assetService.get(payment.quote.assetId)
  stopTimerAssetGet()

  if (asset) payment.quote.asset = asset

  if (payment.state !== OutgoingPaymentState.Funding) {
    stopTimerFund()
    return FundingError.WrongState
  }
  if (amount !== payment.debitAmount.value) {
    stopTimerFund()
    return FundingError.InvalidAmount
  }

  const stopTimerCreateLiquidity = deps.telemetry.startTimer(
    'outgoing_payment_service_fund_create_liquidity_time_ms',
    {
      callName: 'OutgoingPaymentService:fundPayment:createLiquidityAccount',
      description: 'Time to create liquidity account for outgoing payment'
    }
  )
  try {
    await deps.accountingService.createLiquidityAccount(
      {
        id: id,
        asset: payment.asset
      },
      LiquidityAccountType.OUTGOING
    )
  } catch (err) {
    // Don't complain if liquidity account already exists.
    if (err instanceof AccountAlreadyExistsError) {
      // Do nothing.
      console.log('AccountAlreadyExistsError')
    } else {
      stopTimerCreateLiquidity()
      stopTimerFund()
      throw err
    }
  }
  stopTimerCreateLiquidity()

  const stopTimerCreateDeposit = deps.telemetry.startTimer(
    'outgoing_payment_service_fund_create_deposit_time_ms',
    {
      callName: 'OutgoingPaymentService:fundPayment:createDeposit',
      description: 'Time to create deposit for outgoing payment'
    }
  )
  const error = await deps.accountingService.createDeposit({
    id: transferId,
    account: payment,
    amount
  })
  stopTimerCreateDeposit()

  if (error) {
    stopTimerFund()
    return error
  }

  const stopTimerAddSentAmount = deps.telemetry.startTimer(
    'outgoing_payment_service_fund_add_sent_amount_time_ms',
    {
      callName: 'OutgoingPaymentService:fundPayment:addSentAmount',
      description: 'Time to add sent amount for outgoing payment'
    }
  )
  const paymentWithSentAmount = await addSentAmount(deps, payment)
  stopTimerAddSentAmount()

  const paymentForEvent = {
    ...paymentWithSentAmount.toJSON(),
    assetId: paymentWithSentAmount.assetId,
    state: OutgoingPaymentState.Sending,
    quote: {
      ...paymentWithSentAmount.quote.toJSON(),
      assetId: paymentWithSentAmount.quote.assetId,
      estimatedExchangeRate: paymentWithSentAmount.quote.estimatedExchangeRate
    }
  }

  queue.add('funded', paymentForEvent, {
    attempts: 5, // Retry up to 5 times
    backoff: {
      type: 'exponential', // or 'fixed'
      delay: 3000 // 3-second delay between retries
    }
  })

  stopTimerFund()

  return paymentWithSentAmount
  // })
}

// - added queue
// - rm update only
// seems about the same with removing the trx, forUpdate. guess
async function fundPayment2(
  deps: ServiceDependencies,
  { id, amount, transferId }: FundOutgoingPaymentOptions
): Promise<OutgoingPayment | FundingError> {
  return await deps.knex.transaction(async (trx) => {
    const payment = await OutgoingPayment.query(trx)
      .findById(id)
      .forUpdate()
      .withGraphFetched('quote')
    if (!payment) return FundingError.UnknownPayment

    const asset = await deps.assetService.get(payment.quote.assetId)
    if (asset) payment.quote.asset = asset

    if (payment.state !== OutgoingPaymentState.Funding) {
      return FundingError.WrongState
    }
    if (amount !== payment.debitAmount.value) return FundingError.InvalidAmount

    // Create the outgoing payment liquidity account before trying to transfer funds to it.
    try {
      await deps.accountingService.createLiquidityAccount(
        {
          id: id,
          asset: payment.asset
        },
        LiquidityAccountType.OUTGOING
      )
    } catch (err) {
      // Don't complain if liquidity account already exists.
      if (err instanceof AccountAlreadyExistsError) {
        // Do nothing.
        console.log('AccountAlreadyExistsError')
      } else {
        throw err
      }
    }

    const error = await deps.accountingService.createDeposit({
      id: transferId,
      account: payment,
      amount
    })
    if (error) {
      return error
    }
    // const updatedPayment = await payment
    //   .$query(trx)
    //   .patch({ state: OutgoingPaymentState.Sending })

    const paymentWithSentAmount = await addSentAmount(deps, payment)

    // TODO: just publish the event with id?
    // intended on puttingn the payment data on it and using that,
    // but had to lookup the payment again by id to ensure it was well formed.
    // possible in theory to avoid this extra lookup but its nott he bottleneck atm
    // and the lookup isnt locking like the original worker.
    const paymentForEvent = {
      ...paymentWithSentAmount.toJSON(),
      assetId: paymentWithSentAmount.assetId,
      state: OutgoingPaymentState.Sending,
      // not sure why paymentWithSentAmount.toJSON doesnt include the assetId (quote exsits
      // and paymentWithSentAmount has the assetId. ???)
      // - because these are viritual feidls!
      quote: {
        ...paymentWithSentAmount.quote.toJSON(),
        assetId: paymentWithSentAmount.quote.assetId,
        estimatedExchangeRate: paymentWithSentAmount.quote.estimatedExchangeRate
      }
    }

    queue.add('funded', paymentForEvent, {
      attempts: 5, // Retry up to 5 times
      backoff: {
        type: 'exponential', // or 'fixed'
        delay: 3000 // 3-second delay between retries
      }
    })

    return paymentWithSentAmount
    // })
  })
}

async function getWalletAddressPage(
  deps: ServiceDependencies,
  options: ListOptions
): Promise<OutgoingPayment[]> {
  const page = await OutgoingPayment.query(deps.knex)
    .list(options)
    .withGraphFetched('quote')
  for (const payment of page) {
    payment.walletAddress = await deps.walletAddressService.get(
      payment.walletAddressId
    )
    const asset = await deps.assetService.get(payment.quote.assetId)
    if (asset) payment.quote.asset = asset
  }

  const amounts = await deps.accountingService.getAccountsTotalSent(
    page.map((payment: OutgoingPayment) => payment.id)
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  return page.map((payment: OutgoingPayment, i: number) => {
    payment.sentAmount = {
      value: validateSentAmount(deps, payment, amounts[i]),
      assetCode: payment.asset.code,
      assetScale: payment.asset.scale
    }
    return payment
  })
}

async function addSentAmount(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  value?: bigint
): Promise<OutgoingPayment> {
  const sentAmount =
    value ?? (await deps.accountingService.getTotalSent(payment.id))

  payment.sentAmount = {
    value: validateSentAmount(deps, payment, sentAmount),
    assetCode: payment.asset.code,
    assetScale: payment.asset.scale
  }

  return payment
}

function validateSentAmount(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  sentAmount: bigint | undefined
): bigint {
  if (sentAmount !== undefined) {
    return sentAmount
  }

  if (
    [OutgoingPaymentState.Funding, OutgoingPaymentState.Cancelled].includes(
      payment.state
    )
  ) {
    return BigInt(0)
  }

  const errorMessage =
    'Could not get amount sent for payment. There was a problem getting the associated liquidity account.'

  deps.logger.error(
    { outgoingPayment: payment.id, state: payment.state },
    errorMessage
  )
  throw new Error(errorMessage)
}
