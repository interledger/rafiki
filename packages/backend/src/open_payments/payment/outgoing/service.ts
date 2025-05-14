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
import { IAppConfig } from '../../../config/app'
import { AssetService } from '../../../asset/service'
import { Span, trace } from '@opentelemetry/api'
import { FeeService } from '../../../fee/service'
import { OutgoingPaymentGrantSpentAmounts } from './model'
import { v4 as uuid } from 'uuid'

const DEFAULT_GRANT_LOCK_TIMEOUT_MS = 5000

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
  feeService: FeeService
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
    outgoingPayment.quote.walletAddress = await deps.walletAddressService.get(
      outgoingPayment.quote.walletAddressId
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
  const tracer = trace.getTracer('outgoing_payment_service_create')

  return tracer.startActiveSpan(
    'outgoingPaymentService.createOutgoingPayment',
    async (span: Span) => {
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
        const stopTimerWA = deps.telemetry.startTimer(
          'outgoing_payment_service_getwalletaddress_time_ms',
          {
            callName: 'WalletAddressService:get',
            description: 'Time to get wallet address in outgoing payment'
          }
        )
        const walletAddress =
          await deps.walletAddressService.get(walletAddressId)
        stopTimerWA()
        if (!walletAddress) {
          throw OutgoingPaymentError.UnknownWalletAddress
        }
        if (!walletAddress.isActive) {
          throw OutgoingPaymentError.InactiveWalletAddress
        }

        const quote = await deps.quoteService.get({ id: quoteId })
        if (!quote) {
          return OutgoingPaymentError.UnknownQuote
        }
        if (quote.feeId) {
          quote.fee = await deps.feeService.get(quote.feeId)
        }

        const asset = await deps.assetService.get(quote.assetId)

        const stopTimerReceiver = deps.telemetry.startTimer(
          'outgoing_payment_service_getreceiver_time_ms',
          {
            callName: 'ReceiverService:get',
            description: 'Time to retrieve receiver in outgoing payment'
          }
        )

        const receiver = await deps.receiverService.get(quote.receiver)
        stopTimerReceiver()
        if (!receiver || !receiver.isActive()) {
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

        const payment = await OutgoingPayment.transaction(async (trx) => {
          let existingOutgoingPaymentGrant: OutgoingPaymentGrant | undefined

          if (grantId) {
            const existingGrant =
              await OutgoingPaymentGrant.query(trx).findById(grantId)

            if (!existingGrant) {
              // TODO: insert w/ interval
              await OutgoingPaymentGrant.query(trx)
                .insert({ id: grantId })
                .onConflict('id')
                .ignore()
            }
          }
          const stopTimerInsertPayment = deps.telemetry.startTimer(
            'outgoing_payment_service_insertpayment_time_ms',
            {
              callName: 'OutgoingPayment.insert',
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
          payment.walletAddress = walletAddress
          payment.quote = quote
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
              {
                payment,
                grant: options.grant,
                trx,
                callback: options.callback,
                isExistingGrant: Boolean(existingOutgoingPaymentGrant),
                grantLockTimeoutMs: options.grantLockTimeoutMs
              }
            )

            stopTimerValidateGrant()
            if (!isValid) {
              throw OutgoingPaymentError.InsufficientGrant
            }
          }

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

          return payment
        })

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
        span.end()
      }
    }
  )
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

// function validatePaymentInterval({
//   limits,
//   payment
// }: {
//   limits: PaymentLimits
//   payment: OutgoingPayment
// }): boolean {
//   return (
//     !limits.paymentInterval ||
//     (limits.paymentInterval.start !== null &&
//       limits.paymentInterval.start.toMillis() <= payment.createdAt.getTime() &&
//       limits.paymentInterval.end !== null &&
//       payment.createdAt.getTime() < limits.paymentInterval.end.toMillis())
//   )
// }

type IntervalClassification = 'past' | 'current' | 'future' | 'unrestricted'

function classifyPaymentInterval({
  limits,
  payment
}: {
  limits: PaymentLimits
  payment: OutgoingPayment
}): IntervalClassification {
  const interval = limits.paymentInterval

  if (!interval) {
    return 'unrestricted'
  }

  const createdTime = payment.createdAt.getTime()
  const start = interval.start?.toMillis() ?? -Infinity
  const end = interval.end?.toMillis() ?? Infinity

  if (createdTime < start) {
    return 'future'
  } else if (createdTime >= end) {
    return 'past'
  } else {
    return 'current'
  }
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

interface SpentAmounts {
  sent: Amount
  received: Amount
  intervalSent: Amount | null
  intervalReceived: Amount | null
}

interface SpentAmountsWithIntervals extends SpentAmounts {
  intervalSent: Amount
  intervalReceived: Amount
}

async function validateGrantAndAddSpentAmountsToPayment(
  deps: ServiceDependencies,
  args: {
    payment: OutgoingPayment
    grant: Grant
    trx: TransactionOrKnex
    callback?: (f: unknown) => NodeJS.Timeout
    isExistingGrant: boolean
    grantLockTimeoutMs?: number
  }
): Promise<boolean> {
  const {
    payment,
    grant,
    trx,
    callback,
    isExistingGrant,
    grantLockTimeoutMs = DEFAULT_GRANT_LOCK_TIMEOUT_MS
  } = args

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

  // Lock the grant record
  await OutgoingPaymentGrant.query(trx)
    .where('id', grant.id)
    .forNoKeyUpdate()
    .timeout(grantLockTimeoutMs)

  if (callback) await new Promise(callback)

  // Get the most recent spent amounts record
  const latestSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(trx)
    .where('grantId', grant.id)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .first()

  let newSpentAmounts: SpentAmounts | SpentAmountsWithIntervals

  if (isExistingGrant && !latestSpentAmounts) {
    // Legacy path: calculate spent amounts from historical payments
    const grantPayments = await OutgoingPayment.query(trx)
      .where({
        grantId: grant.id
      })
      .andWhereNot({
        id: payment.id
      })
      .withGraphFetched('quote')

    const hasInterval = !!paymentLimits.paymentInterval

    newSpentAmounts = {
      sent: {
        assetCode: payment.asset.code,
        assetScale: payment.asset.scale,
        value: BigInt(0)
      },
      received: {
        assetCode: payment.receiveAmount.assetCode,
        assetScale: payment.receiveAmount.assetScale,
        value: BigInt(0)
      },
      intervalSent: hasInterval
        ? {
            assetCode: payment.asset.code,
            assetScale: payment.asset.scale,
            value: 0n
          }
        : null,
      intervalReceived: hasInterval
        ? {
            assetCode: payment.receiveAmount.assetCode,
            assetScale: payment.receiveAmount.assetScale,
            value: 0n
          }
        : null
    }

    for (const grantPayment of grantPayments) {
      const asset = await deps.assetService.get(grantPayment.quote.assetId)
      if (asset) grantPayment.quote.asset = asset

      const intervalStatus = classifyPaymentInterval({
        limits: paymentLimits,
        payment: grantPayment
      })

      if (grantPayment.failed) {
        const totalSent = validateSentAmount(
          deps,
          payment,
          await deps.accountingService.getTotalSent(grantPayment.id)
        )

        if (totalSent === BigInt(0)) {
          continue
        }

        // Sum grant totals
        newSpentAmounts.sent.value += totalSent
        // Estimate delivered amount of failed payment
        newSpentAmounts.received.value +=
          (grantPayment.receiveAmount.value * totalSent) /
          grantPayment.debitAmount.value

        // If payment is in current interval, update interval amounts too
        if (intervalStatus === 'current') {
          if (
            !newSpentAmounts.intervalSent ||
            !newSpentAmounts.intervalReceived
          ) {
            throw OutgoingPaymentError.InvalidGrantSpentAmountState
          }

          newSpentAmounts.intervalSent.value =
            (newSpentAmounts.intervalSent.value ?? 0n) + totalSent
          newSpentAmounts.intervalReceived.value =
            (newSpentAmounts.intervalReceived.value ?? 0n) +
            (grantPayment.receiveAmount.value * totalSent) /
              grantPayment.debitAmount.value
        }
      } else {
        // Sum grant totals for successful payments
        newSpentAmounts.sent.value += grantPayment.debitAmount.value
        newSpentAmounts.received.value += grantPayment.receiveAmount.value

        // If payment is in current interval, update interval amounts too
        if (intervalStatus === 'current') {
          if (
            !newSpentAmounts.intervalSent ||
            !newSpentAmounts.intervalReceived
          ) {
            throw OutgoingPaymentError.InvalidGrantSpentAmountState
          }
          newSpentAmounts.intervalSent.value =
            (newSpentAmounts.intervalSent.value ?? 0n) +
            grantPayment.debitAmount.value
          newSpentAmounts.intervalReceived.value =
            (newSpentAmounts.intervalReceived.value ?? 0n) +
            grantPayment.receiveAmount.value
        }
      }
    }
  } else {
    const intervalStatus = classifyPaymentInterval({
      limits: paymentLimits,
      payment
    })

    const hasInterval = !!paymentLimits.paymentInterval
    const startingSpendAmounts = latestSpentAmounts ?? {
      debitAmountCode: payment.asset.code,
      debitAmountScale: payment.asset.scale,
      intervalDebitAmountValue: 0n,
      receiveAmountCode: payment.receiveAmount.assetCode,
      receiveAmountScale: payment.receiveAmount.assetScale,
      intervalReceiveAmountValue: 0n,
      grantTotalReceiveAmountValue: 0n,
      grantTotalDebitAmountValue: 0n
    }

    newSpentAmounts = {
      sent: {
        assetCode: startingSpendAmounts.debitAmountCode,
        assetScale: startingSpendAmounts.debitAmountScale,
        value: startingSpendAmounts.grantTotalDebitAmountValue
      },
      received: {
        assetCode: startingSpendAmounts.receiveAmountCode,
        assetScale: startingSpendAmounts.receiveAmountScale,
        value: startingSpendAmounts.grantTotalReceiveAmountValue
      },
      intervalSent: null,
      intervalReceived: null
    }

    if (hasInterval) {
      if (
        startingSpendAmounts.intervalDebitAmountValue === null ||
        startingSpendAmounts.intervalReceiveAmountValue === null
      ) {
        throw OutgoingPaymentError.InvalidGrantSpentAmountState
      }
      newSpentAmounts.intervalSent = {
        assetCode: startingSpendAmounts.debitAmountCode,
        assetScale: startingSpendAmounts.debitAmountScale,
        value:
          intervalStatus === 'future'
            ? 0n
            : startingSpendAmounts.intervalDebitAmountValue
      }
      newSpentAmounts.intervalReceived = {
        assetCode: startingSpendAmounts.receiveAmountCode,
        assetScale: startingSpendAmounts.receiveAmountScale,
        value:
          intervalStatus === 'future'
            ? 0n
            : startingSpendAmounts.intervalReceiveAmountValue
      }
    }
  }

  const grantSpentDebitAmount =
    newSpentAmounts.intervalSent !== null
      ? (newSpentAmounts.intervalSent as {
          value: bigint
          assetCode: string
          assetScale: number
        })
      : newSpentAmounts.sent

  const grantSpentReceiveAmount =
    newSpentAmounts.intervalReceived !== null
      ? (newSpentAmounts.intervalReceived as {
          value: bigint
          assetCode: string
          assetScale: number
        })
      : newSpentAmounts.received

  // spent amounts exclude current payment
  // Store the spent amounts BEFORE adding the current payment
  payment.grantSpentDebitAmount = grantSpentDebitAmount
  payment.grantSpentReceiveAmount = grantSpentReceiveAmount

  // fail if payment exceeds limits
  if (
    (paymentLimits.debitAmount &&
      paymentLimits.debitAmount.value - newSpentAmounts.sent.value <
        payment.debitAmount.value) ||
    (paymentLimits.receiveAmount &&
      paymentLimits.receiveAmount.value - newSpentAmounts.received.value <
        payment.receiveAmount.value)
  ) {
    return false
  }

  // TODO: check interval amounts like above ^

  newSpentAmounts.sent.value += payment.debitAmount.value
  newSpentAmounts.received.value += payment.receiveAmount.value

  if (newSpentAmounts.intervalSent !== null) {
    newSpentAmounts.intervalSent.value += payment.debitAmount.value
  }

  if (newSpentAmounts.intervalReceived !== null) {
    newSpentAmounts.intervalReceived.value += payment.receiveAmount.value
  }

  await OutgoingPaymentGrantSpentAmounts.query(trx).insert({
    id: uuid(),
    grantId: grant.id,
    outgoingPaymentId: payment.id,
    receiveAmountScale: payment.receiveAmount.assetScale,
    receiveAmountCode: payment.receiveAmount.assetCode,
    paymentReceiveAmountValue: payment.receiveAmount.value,
    intervalReceiveAmountValue: newSpentAmounts.intervalReceived?.value ?? null,
    grantTotalReceiveAmountValue: newSpentAmounts.received.value,
    debitAmountScale: payment.debitAmount.assetScale,
    debitAmountCode: payment.debitAmount.assetCode,
    paymentDebitAmountValue: payment.debitAmount.value,
    intervalDebitAmountValue: newSpentAmounts.intervalSent?.value ?? null,
    grantTotalDebitAmountValue: newSpentAmounts.sent.value,
    paymentState: payment.state,
    intervalStart: paymentLimits.paymentInterval?.start?.toJSDate() || null,
    intervalEnd: paymentLimits.paymentInterval?.end?.toJSDate() || null
  })

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
    await payment.$query(trx).patch({ state: OutgoingPaymentState.Sending })
    return await addSentAmount(deps, payment)
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
    payment.quote.walletAddress = await deps.walletAddressService.get(
      payment.quote.walletAddressId
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
