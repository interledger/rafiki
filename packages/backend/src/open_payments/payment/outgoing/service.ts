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
import { AssetService } from '../../../asset/service'
import { CacheDataStore } from '../../../cache'

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
  processNext(): Promise<string | undefined>
}

export interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  accountingService: AccountingService
  receiverService: ReceiverService
  peerService: PeerService
  paymentMethodHandlerService: PaymentMethodHandlerService
  walletAddressService: WalletAddressService
  quoteService: QuoteService
  assetService: AssetService
  cacheDataStore: CacheDataStore
  sendingOutgoing: string[]
  telemetry?: TelemetryService
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
    processNext: () => worker.processPendingPayment(deps),
    getWalletAddressPage: (options) => getOutgoingPaymentPage(deps, options)
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

  const query = OutgoingPayment.query(deps.knex)

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
  const amounts = await deps.accountingService.getAccountsTotalSent(
    page.map((payment: OutgoingPayment) => payment.id)
  )
  for (const payment of page) {
    await deps.walletAddressService.setOn(payment)
    await deps.assetService.setOn(payment.walletAddress)
    await deps.quoteService.setOn(payment)
    await deps.assetService.setOn(payment.quote)
  }

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
  if (options.id.trim().length) {
    const cache = (await deps.cacheDataStore.get(options.id)) as OutgoingPayment
    if (cache) return cache
  }

  const outgoingPayment = await OutgoingPayment.query(deps.knex).get(options)
  if (outgoingPayment) {
    await deps.walletAddressService.setOn(outgoingPayment)
    await deps.quoteService.setOn(outgoingPayment)
    await deps.assetService.setOn(outgoingPayment.quote)
    const returnVal = await addSentAmount(deps, outgoingPayment)
    if (options.id.trim().length) {
      await deps.cacheDataStore.set(options.id, returnVal)
    }
    return returnVal
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

    payment = await payment.$query(trx).patchAndFetch({
      state: OutgoingPaymentState.Cancelled,
      metadata: {
        ...payment.metadata,
        ...(options.reason ? { cancellationReason: options.reason } : {})
      }
    })

    await deps.walletAddressService.setOn(payment)
    await deps.assetService.setOn(payment.walletAddress)
    await deps.quoteService.setOn(payment)
    await deps.assetService.setOn(payment.quote)

    await deps.cacheDataStore.delete(options.id)

    return addSentAmount(deps, payment)
  })
}

async function createOutgoingPayment(
  deps: ServiceDependencies,
  options: CreateOutgoingPaymentOptions
): Promise<OutgoingPayment | OutgoingPaymentError> {
  const stopTimerOP = deps.telemetry?.startTimer(
    'outgoing_payment_service_create_time_ms',
    {
      description: 'Time to create an outgoing payment'
    }
  )

  const { walletAddressId } = options
  let quoteId: string

  if (isCreateFromIncomingPayment(options)) {
    const stopTimerQuote = deps.telemetry?.startTimer(
      'outgoing_payment_service_create_quote_time_ms',
      {
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

    stopTimerQuote && stopTimerQuote()

    if (isQuoteError(quoteOrError)) {
      return quoteErrorToOutgoingPaymentError[quoteOrError]
    }
    quoteId = quoteOrError.id
  } else {
    quoteId = options.quoteId
  }

  const grantId = options.grant?.id
  try {
    return await OutgoingPayment.transaction(deps.knex, async (trx) => {
      const stopTimerWA = deps.telemetry?.startTimer(
        'outgoing_payment_service_getwalletaddress_time_ms',
        {
          description: 'Time to get wallet address in outgoing payment'
        }
      )

      const walletAddress = await deps.walletAddressService.get(walletAddressId)

      if (!walletAddress) {
        throw OutgoingPaymentError.UnknownWalletAddress
      }
      stopTimerWA && stopTimerWA()

      if (!walletAddress.isActive) {
        throw OutgoingPaymentError.InactiveWalletAddress
      }

      if (grantId) {
        const stopTimerGrant = deps.telemetry?.startTimer(
          'outgoing_payment_service_insertgrant_time_ms',
          {
            description: 'Time to insert grant in outgoing payment'
          }
        )
        await OutgoingPaymentGrant.query(trx)
          .insert({
            id: grantId
          })
          .onConflict('id')
          .ignore()
        stopTimerGrant && stopTimerGrant()
      }
      const stopTimerInsertPayment = deps.telemetry?.startTimer(
        'outgoing_payment_service_insertpayment_time_ms',
        {
          description: 'Time to insert payment in outgoing payment'
        }
      )
      const payment = await OutgoingPayment.query(trx).insertAndFetch({
        id: quoteId,
        walletAddressId: walletAddressId,
        client: options.client,
        metadata: options.metadata,
        state: OutgoingPaymentState.Funding,
        grantId
      })
      await deps.quoteService.setOn(payment)
      await deps.assetService.setOn(payment.quote)
      await deps.walletAddressService.setOn(payment)

      stopTimerInsertPayment && stopTimerInsertPayment()

      if (
        payment.walletAddressId !== payment.quote.walletAddressId ||
        payment.quote.expiresAt.getTime() <= payment.createdAt.getTime()
      ) {
        throw OutgoingPaymentError.InvalidQuote
      }

      if (options.grant) {
        const stopTimerValidateGrant = deps.telemetry?.startTimer(
          'outgoing_payment_service_validate_grant_time_ms',
          {
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

        stopTimerValidateGrant && stopTimerValidateGrant()
        if (!isValid) {
          throw OutgoingPaymentError.InsufficientGrant
        }
      }

      const stopTimerReceiver = deps.telemetry?.startTimer(
        'outgoing_payment_service_getreceiver_time_ms',
        {
          description: 'Time to retrieve receiver in outgoing payment'
        }
      )

      const receiver = await deps.receiverService.get(payment.receiver)

      stopTimerReceiver && stopTimerReceiver()

      if (!receiver) {
        throw OutgoingPaymentError.InvalidQuote
      }

      const stopTimerPeer = deps.telemetry?.startTimer(
        'outgoing_payment_service_getpeer_time_ms',
        {
          description: 'Time to retrieve peer in outgoing payment'
        }
      )
      const peer = await deps.peerService.getByDestinationAddress(
        receiver.ilpAddress
      )
      stopTimerPeer && stopTimerPeer()

      const stopTimerPeerUpdate = deps.telemetry?.startTimer(
        'outgoing_payment_service_patchpeer_time_ms',
        {
          description: 'Time to patch peer in outgoing payment'
        }
      )
      if (peer) await payment.$query(trx).patch({ peerId: peer.id })
      stopTimerPeerUpdate && stopTimerPeerUpdate()

      const stopTimerWebhook = deps.telemetry?.startTimer(
        'outgoing_payment_service_webhook_event_time_ms',
        {
          description: 'Time to add outgoing payment webhook event'
        }
      )
      await sendWebhookEvent(
        deps,
        payment,
        OutgoingPaymentEventType.PaymentCreated,
        trx
      )
      stopTimerWebhook && stopTimerWebhook()

      const stopTimerAddAmount = deps.telemetry?.startTimer(
        'outgoing_payment_service_add_sent_time_ms',
        {
          description: 'Time to add sent amount to outgoing payment'
        }
      )

      const paymentWithSentAmount = await addSentAmount(
        deps,
        payment,
        BigInt(0)
      )

      stopTimerAddAmount && stopTimerAddAmount()
      await deps.cacheDataStore.set(
        paymentWithSentAmount.id,
        paymentWithSentAmount
      )

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
    stopTimerOP && stopTimerOP()
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

  await OutgoingPaymentGrant.query(trx || deps.knex)
    .where('id', grant.id)
    .forNoKeyUpdate()
    .timeout(grantLockTimeoutMs)

  if (callback) await new Promise(callback)

  const grantPayments = await OutgoingPayment.query(trx || deps.knex)
    .where({
      grantId: grant.id
    })
    .andWhereNot({
      id: payment.id
    })
  if (grantPayments.length === 0) return true

  for (const payment of grantPayments) {
    await deps.quoteService.setOn(payment)
    await deps.assetService.setOn(payment.quote)
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

async function fundPayment(
  deps: ServiceDependencies,
  { id, amount, transferId }: FundOutgoingPaymentOptions
): Promise<OutgoingPayment | FundingError> {
  const stopTimer = deps.telemetry?.startTimer('fundPayment', {
    callName: 'fundPayment'
  })
  const outgoingPaymentOrError = deps.knex.transaction(async (trx) => {
    const cache = (await deps.cacheDataStore.get(id)) as OutgoingPayment
    let payment
    if (cache) {
      payment = cache
    } else {
      payment = await OutgoingPayment.query(trx).findById(id)
    }
    if (!payment) {
      stopTimer && stopTimer()
      return FundingError.UnknownPayment
    }

    await deps.quoteService.setOn(payment)
    await deps.assetService.setOn(payment.quote)

    if (payment.state !== OutgoingPaymentState.Funding) {
      stopTimer && stopTimer()
      return FundingError.WrongState
    }
    if (amount !== payment.debitAmount.value) {
      stopTimer && stopTimer()
      return FundingError.InvalidAmount
    }

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
      } else {
        stopTimer && stopTimer()
        throw err
      }
    }

    const error = await deps.accountingService.createDeposit({
      id: transferId,
      account: payment,
      amount
    })
    if (error) {
      stopTimer && stopTimer()
      return error
    }
    await payment.$query(trx).patch({ state: OutgoingPaymentState.Sending })
    const paymentWithSentAmount = await addSentAmount(deps, payment)

    await deps.cacheDataStore.set(
      paymentWithSentAmount.id,
      paymentWithSentAmount
    )
    deps.sendingOutgoing.push(paymentWithSentAmount.id)
    stopTimer && stopTimer()

    return paymentWithSentAmount
  })
  stopTimer && stopTimer()
  return outgoingPaymentOrError
}

async function getOutgoingPaymentPage(
  deps: ServiceDependencies,
  options: ListOptions
): Promise<OutgoingPayment[]> {
  const page = await OutgoingPayment.query(deps.knex).list(options)
  const amounts = await deps.accountingService.getAccountsTotalSent(
    page.map((payment: OutgoingPayment) => payment.id)
  )

  for (const payment of page) {
    await deps.walletAddressService.setOn(payment)
    await deps.quoteService.setOn(payment)
    await deps.assetService.setOn(payment.walletAddress)
    await deps.assetService.setOn(payment.quote)
  }

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
