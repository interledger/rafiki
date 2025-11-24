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
import { OutgoingPaymentInitiationReason } from './model'
import { Grant } from '../../auth/middleware'
import {
  AccountingService,
  LiquidityAccountType
} from '../../../accounting/service'
import { ReceiverService } from '../../receiver/service'
import { GetOptions, ListOptions } from '../../wallet_address/model'
import {
  WalletAddressService,
  WalletAddressSubresourceService
} from '../../wallet_address/service'
import { sendWebhookEvent } from './lifecycle'
import * as worker from './worker'
import { DateTime, Interval } from 'luxon'
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
import { OutgoingPaymentCardDetails } from './card/model'

const DEFAULT_GRANT_LOCK_TIMEOUT_MS = 5000

export interface GrantSpentAmounts {
  spentDebitAmount: Amount | null
  spentReceiveAmount: Amount | null
}

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
  getGrantSpentAmounts(options: {
    grantId: string
    limits?: Limits
  }): Promise<GrantSpentAmounts>
}

export interface ServiceDependencies extends BaseService {
  config: IAppConfig
  knex: TransactionOrKnex
  accountingService: AccountingService
  receiverService: ReceiverService
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
    getWalletAddressPage: (options) => getWalletAddressPage(deps, options),
    getGrantSpentAmounts: (options) => getGrantSpentAmounts(deps, options)
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
  tenantId?: string
}

async function getOutgoingPaymentsPage(
  deps: ServiceDependencies,
  options?: GetPageOptions
): Promise<OutgoingPayment[]> {
  const { filter, pagination, sortOrder, tenantId } = options ?? {}

  const query = OutgoingPayment.query(deps.knex).withGraphFetched('quote')

  if (tenantId) {
    query.where('tenantId', tenantId)
  }

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
    .modify((query) => {
      if (options.tenantId) {
        query.where({ tenantId: options.tenantId })
      }
    })
    .get(options)
    .withGraphFetched('quote')
  if (outgoingPayment) {
    outgoingPayment.walletAddress = await deps.walletAddressService.get(
      outgoingPayment.walletAddressId,
      outgoingPayment.tenantId
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
  tenantId: string
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
  debitAmount?: Amount
}

export interface CreateFromCardPayment extends CreateFromIncomingPayment {
  cardDetails: {
    requestId: string
    data: Record<string, unknown>
    initiatedAt: Date
  }
}

export type CancelOutgoingPaymentOptions = {
  id: string
  tenantId: string
  reason?: string
  cardPaymentFailureReason?: 'invalid_signature' | 'invalid_request'
}

export type CreateOutgoingPaymentOptions =
  | CreateFromQuote
  | CreateFromIncomingPayment
  | CreateFromCardPayment

export function isCreateFromCardPayment(
  options: CreateOutgoingPaymentOptions
): options is CreateFromCardPayment {
  return 'cardDetails' in options && 'requestId' in options.cardDetails
}

export function isCreateFromIncomingPayment(
  options: CreateOutgoingPaymentOptions
): options is CreateFromIncomingPayment {
  return 'incomingPayment' in options
}

async function cancelOutgoingPayment(
  deps: ServiceDependencies,
  options: CancelOutgoingPaymentOptions
): Promise<OutgoingPayment | OutgoingPaymentError> {
  const { id, tenantId } = options

  return deps.knex.transaction(async (trx) => {
    let payment = await OutgoingPayment.query(trx)
      .findOne({
        id,
        tenantId
      })
      .forUpdate()

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
          ...(options.reason ? { cancellationReason: options.reason } : {}),
          ...(options.cardPaymentFailureReason
            ? { cardPaymentFailureReason: options.cardPaymentFailureReason }
            : {})
        }
      })
      .withGraphFetched('[quote, cardDetails]')
    const asset = await deps.assetService.get(payment.quote.assetId)
    if (asset) payment.quote.asset = asset

    payment.walletAddress = await deps.walletAddressService.get(
      payment.walletAddressId
    )
    if (payment.grantId) {
      await revertGrantSpentAmounts({ ...deps, knex: trx }, payment)
    }

    if (payment.initiatedBy === OutgoingPaymentInitiationReason.Card) {
      await sendWebhookEvent(
        deps,
        payment,
        OutgoingPaymentEventType.PaymentCancelled,
        trx
      )
    }

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
      const { walletAddressId, tenantId } = options
      let quoteId: string

      if (isCreateFromIncomingPayment(options)) {
        const stopTimerQuote = deps.telemetry.startTimer(
          'outgoing_payment_service_create_quote_time_ms',
          {
            callName: 'QuoteService:create',
            description: 'Time to create a quote in outgoing payment'
          }
        )
        const quoteOrError = await deps.quoteService.create({
          tenantId,
          receiver: options.incomingPayment,
          debitAmount: options.debitAmount,
          method: 'ilp',
          walletAddressId
        })
        stopTimerQuote()

        if (isQuoteError(quoteOrError)) {
          return quoteErrorToOutgoingPaymentError[quoteOrError.type]
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
        const walletAddress = await deps.walletAddressService.get(
          walletAddressId,
          tenantId
        )
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

        const payment = await OutgoingPayment.transaction(async (trx) => {
          let existingGrant: OutgoingPaymentGrant | undefined

          if (grantId) {
            existingGrant =
              await OutgoingPaymentGrant.query(trx).findById(grantId)

            if (!existingGrant) {
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

          let initiatedBy: OutgoingPaymentInitiationReason
          if (isCreateFromCardPayment(options)) {
            initiatedBy = OutgoingPaymentInitiationReason.Card
          } else if (options.grant) {
            initiatedBy = OutgoingPaymentInitiationReason.OpenPayments
          } else {
            initiatedBy = OutgoingPaymentInitiationReason.Admin
          }

          const payment = await OutgoingPayment.query(trx).insertAndFetch({
            id: quoteId,
            tenantId,
            walletAddressId: walletAddressId,
            client: options.client,
            metadata: options.metadata,
            state: OutgoingPaymentState.Funding,
            grantId,
            createdAt: new Date(),
            initiatedBy
          })

          if (isCreateFromCardPayment(options)) {
            const { data, requestId, initiatedAt } = options.cardDetails

            payment.cardDetails = await OutgoingPaymentCardDetails.query(
              trx
            ).insertAndFetch({
              outgoingPaymentId: payment.id,
              requestId,
              data,
              initiatedAt
            })
          }

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
                isExistingGrant: Boolean(existingGrant),
                grantLockTimeoutMs: options.grantLockTimeoutMs
              }
            )

            stopTimerValidateGrant()
            if (!isValid) {
              throw OutgoingPaymentError.InsufficientGrant
            }
          }

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

export enum IntervalStatus {
  Previous = 'previous',
  Current = 'current',
  Next = 'next'
}

function validateAmountAssets(
  payment: OutgoingPayment,
  limits: Limits
): boolean {
  if (limits.debitAmount && limits.receiveAmount) {
    throw OutgoingPaymentError.OnlyOneGrantAmountAllowed
  }
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

export interface PaymentLimits extends Limits {
  paymentInterval?: Interval
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

  if (
    paymentLimits.paymentInterval &&
    (!paymentLimits.paymentInterval.start || !paymentLimits.paymentInterval.end)
  ) {
    deps.logger.error(
      {
        grantId: grant.id,
        paymentId: payment.id,
        intervalStart: paymentLimits.paymentInterval.start?.toJSDate(),
        intervalEnd: paymentLimits.paymentInterval.end?.toJSDate()
      },
      'Payment interval missing start or end'
    )
    throw OutgoingPaymentError.InvalidInterval
  }

  // check if payment interval is before latest spent amounts interval
  if (
    paymentLimits.paymentInterval &&
    latestSpentAmounts?.intervalStart &&
    latestSpentAmounts?.intervalEnd &&
    paymentLimits.paymentInterval.end &&
    paymentLimits.paymentInterval.end.toJSDate() <=
      latestSpentAmounts.intervalStart
  ) {
    deps.logger.error(
      {
        grantId: grant.id,
        paymentId: payment.id,
        paymentIntervalStart: paymentLimits.paymentInterval.start?.toJSDate(),
        paymentIntervalEnd: paymentLimits.paymentInterval.end.toJSDate(),
        latestIntervalStart: latestSpentAmounts.intervalStart,
        latestIntervalEnd: latestSpentAmounts.intervalEnd
      },
      'Payment interval is before latest spent amounts interval'
    )
    throw OutgoingPaymentError.InvalidInterval
  }

  const outgoingPaymentGrantSpentAmounts =
    OutgoingPaymentGrantSpentAmounts.create({
      id: uuid(),
      grantId: grant.id,
      outgoingPaymentId: payment.id,
      receiveAmountScale: payment.receiveAmount.assetScale,
      receiveAmountCode: payment.receiveAmount.assetCode,
      paymentReceiveAmountValue: payment.receiveAmount.value,
      intervalReceiveAmountValue: null,
      grantTotalReceiveAmountValue: 0n,
      debitAmountScale: payment.debitAmount.assetScale,
      debitAmountCode: payment.debitAmount.assetCode,
      paymentDebitAmountValue: payment.debitAmount.value,
      intervalDebitAmountValue: null,
      grantTotalDebitAmountValue: 0n,
      paymentState: payment.state,
      intervalStart: paymentLimits.paymentInterval?.start?.toJSDate() || null,
      intervalEnd: paymentLimits.paymentInterval?.end?.toJSDate() || null,
      createdAt: new Date()
    })

  const hasInterval = !!paymentLimits.paymentInterval

  if (isExistingGrant && !latestSpentAmounts) {
    // Legacy path: calculate spent amounts from historical payments
    if (hasInterval) {
      outgoingPaymentGrantSpentAmounts.intervalDebitAmountValue = 0n
      outgoingPaymentGrantSpentAmounts.intervalReceiveAmountValue = 0n
    }

    const grantPayments = await OutgoingPayment.query(trx)
      .where({
        grantId: grant.id
      })
      .andWhereNot({
        id: payment.id
      })
      .withGraphFetched('quote')

    for (const grantPayment of grantPayments) {
      const asset = await deps.assetService.get(grantPayment.quote.assetId)
      if (asset) grantPayment.quote.asset = asset

      const addToInterval =
        paymentLimits.paymentInterval &&
        paymentLimits.paymentInterval.contains(
          DateTime.fromJSDate(grantPayment.createdAt)
        )

      if (grantPayment.failed) {
        const totalSent = validateSentAmount(
          deps,
          payment,
          await deps.accountingService.getTotalSent(grantPayment.id)
        )

        if (totalSent === BigInt(0)) {
          continue
        }

        outgoingPaymentGrantSpentAmounts.grantTotalDebitAmountValue += totalSent
        // Estimate delivered amount of failed payment
        const estimatedReceived =
          (grantPayment.receiveAmount.value * totalSent) /
          grantPayment.debitAmount.value
        outgoingPaymentGrantSpentAmounts.grantTotalReceiveAmountValue +=
          estimatedReceived

        if (addToInterval) {
          outgoingPaymentGrantSpentAmounts.intervalDebitAmountValue =
            (outgoingPaymentGrantSpentAmounts.intervalDebitAmountValue ?? 0n) +
            totalSent
          outgoingPaymentGrantSpentAmounts.intervalReceiveAmountValue =
            (outgoingPaymentGrantSpentAmounts.intervalReceiveAmountValue ??
              0n) + estimatedReceived
        }
      } else {
        outgoingPaymentGrantSpentAmounts.grantTotalDebitAmountValue +=
          grantPayment.debitAmount.value
        outgoingPaymentGrantSpentAmounts.grantTotalReceiveAmountValue +=
          grantPayment.receiveAmount.value

        if (addToInterval) {
          outgoingPaymentGrantSpentAmounts.intervalDebitAmountValue =
            (outgoingPaymentGrantSpentAmounts.intervalDebitAmountValue ?? 0n) +
            grantPayment.debitAmount.value
          outgoingPaymentGrantSpentAmounts.intervalReceiveAmountValue =
            (outgoingPaymentGrantSpentAmounts.intervalReceiveAmountValue ??
              0n) + grantPayment.receiveAmount.value
        }
      }
    }
  } else {
    // detect if we need to restart interval sum at 0 or continue from last
    const isInIntervalAndFirstPayment = hasInterval
      ? !latestSpentAmounts ||
        (latestSpentAmounts.intervalEnd &&
          paymentLimits.paymentInterval?.start &&
          latestSpentAmounts.intervalEnd <=
            paymentLimits.paymentInterval.start.toJSDate())
      : false

    outgoingPaymentGrantSpentAmounts.grantTotalDebitAmountValue =
      latestSpentAmounts?.grantTotalDebitAmountValue ?? 0n
    outgoingPaymentGrantSpentAmounts.grantTotalReceiveAmountValue =
      latestSpentAmounts?.grantTotalReceiveAmountValue ?? 0n

    if (hasInterval) {
      outgoingPaymentGrantSpentAmounts.intervalDebitAmountValue =
        isInIntervalAndFirstPayment
          ? 0n
          : latestSpentAmounts?.intervalDebitAmountValue ?? 0n
      outgoingPaymentGrantSpentAmounts.intervalReceiveAmountValue =
        isInIntervalAndFirstPayment
          ? 0n
          : latestSpentAmounts?.intervalReceiveAmountValue ?? 0n
    }
  }

  if (hasInterval) {
    const debit = outgoingPaymentGrantSpentAmounts.intervalDebitAmountValue
    const receive = outgoingPaymentGrantSpentAmounts.intervalReceiveAmountValue

    if (debit === null || receive === null) {
      throw OutgoingPaymentError.InvalidInterval
    }

    setGrantSpentAmounts(payment, debit, receive)

    if (exceedsGrantLimits(payment, paymentLimits, debit, receive)) {
      return false
    }

    // add current payment to interval
    outgoingPaymentGrantSpentAmounts.intervalDebitAmountValue =
      debit + payment.debitAmount.value
    outgoingPaymentGrantSpentAmounts.intervalReceiveAmountValue =
      receive + payment.receiveAmount.value
  } else {
    const debit = outgoingPaymentGrantSpentAmounts.grantTotalDebitAmountValue
    const receive =
      outgoingPaymentGrantSpentAmounts.grantTotalReceiveAmountValue

    setGrantSpentAmounts(payment, debit, receive)

    if (exceedsGrantLimits(payment, paymentLimits, debit, receive)) {
      return false
    }
  }

  // update totals
  outgoingPaymentGrantSpentAmounts.grantTotalDebitAmountValue +=
    payment.debitAmount.value
  outgoingPaymentGrantSpentAmounts.grantTotalReceiveAmountValue +=
    payment.receiveAmount.value

  await outgoingPaymentGrantSpentAmounts.$query(trx).insert()

  return true
}

function setGrantSpentAmounts(
  payment: OutgoingPayment,
  spentValue: bigint,
  spentReceive: bigint
): void {
  payment.grantSpentDebitAmount = {
    value: spentValue,
    assetCode: payment.debitAmount.assetCode,
    assetScale: payment.debitAmount.assetScale
  }
  payment.grantSpentReceiveAmount = {
    value: spentReceive,
    assetCode: payment.receiveAmount.assetCode,
    assetScale: payment.receiveAmount.assetScale
  }
}

function exceedsGrantLimits(
  payment: OutgoingPayment,
  limits: PaymentLimits,
  spentValue: bigint,
  spentReceive: bigint
): boolean {
  return (
    (limits.debitAmount &&
      limits.debitAmount.value - spentValue < payment.debitAmount.value) ||
    (limits.receiveAmount &&
      limits.receiveAmount.value - spentReceive <
        payment.receiveAmount.value) ||
    false
  )
}

export interface FundOutgoingPaymentOptions {
  id: string
  tenantId: string
  amount: bigint
  transferId: string
}

async function fundPayment(
  deps: ServiceDependencies,
  { id, tenantId, amount, transferId }: FundOutgoingPaymentOptions
): Promise<OutgoingPayment | FundingError> {
  return await deps.knex.transaction(async (trx) => {
    const payment = await OutgoingPayment.query(trx)
      .findOne({
        id,
        tenantId
      })
      .forUpdate()
      .withGraphFetched('[quote, cardDetails]')
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

    if (payment.initiatedBy === OutgoingPaymentInitiationReason.Card) {
      await sendWebhookEvent(
        deps,
        payment,
        OutgoingPaymentEventType.PaymentFunded,
        trx
      )
    }
    return await addSentAmount(deps, payment)
  })
}

async function getWalletAddressPage(
  deps: ServiceDependencies,
  options: ListOptions
): Promise<OutgoingPayment[]> {
  const page = await OutgoingPayment.query(deps.knex)
    .modify((query) => {
      if (options.tenantId) {
        query.where({ tenantId: options.tenantId })
      }
    })
    .list(options)
    .withGraphFetched('quote')
  for (const payment of page) {
    payment.walletAddress = await deps.walletAddressService.get(
      payment.walletAddressId,
      payment.tenantId
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

/**
 * Gets the latest spent amounts record by payment.
 */
async function getLatestPaymentSpentAmounts(
  deps: ServiceDependencies,
  id: string
): Promise<OutgoingPaymentGrantSpentAmounts | undefined> {
  return await OutgoingPaymentGrantSpentAmounts.query(deps.knex)
    .where('outgoingPaymentId', id)
    .orderBy('createdAt', 'desc')
    .first()
}

/**
 * Gets the latest spent amounts records by grantId and payment interval if needed.
 */
async function getRemainingGrantSpentAmounts(
  deps: ServiceDependencies,
  grantId: string,
  latestPaymentSpentAmounts: OutgoingPaymentGrantSpentAmounts
): Promise<{
  latestGrantSpentAmounts: OutgoingPaymentGrantSpentAmounts
  latestIntervalSpentAmounts: OutgoingPaymentGrantSpentAmounts | null
} | null> {
  const latestGrantSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
    deps.knex
  )
    .where('grantId', grantId)
    .orderBy('createdAt', 'desc')
    .first()

  if (!latestGrantSpentAmounts) return null

  // For interval amounts, we need the latest record from this payment's interval
  // (not necessarily the latest overall, nor this specific payment's spent amount record)
  let latestIntervalSpentAmounts: OutgoingPaymentGrantSpentAmounts | null = null

  if (
    latestPaymentSpentAmounts.intervalStart &&
    latestPaymentSpentAmounts.intervalEnd
  ) {
    if (
      latestGrantSpentAmounts.intervalStart?.getTime() !==
        latestPaymentSpentAmounts.intervalStart.getTime() ||
      latestGrantSpentAmounts.intervalEnd?.getTime() !==
        latestPaymentSpentAmounts.intervalEnd.getTime()
    ) {
      latestIntervalSpentAmounts =
        (await OutgoingPaymentGrantSpentAmounts.query(deps.knex)
          .where('grantId', grantId)
          .where('intervalStart', latestPaymentSpentAmounts.intervalStart)
          .where('intervalEnd', latestPaymentSpentAmounts.intervalEnd)
          .orderBy('createdAt', 'desc')
          .first()) ?? null
    } else {
      latestIntervalSpentAmounts = latestGrantSpentAmounts
    }
  }

  return { latestGrantSpentAmounts, latestIntervalSpentAmounts }
}

/**
 * Calculates new interval amounts based on previous interval spent amounts.
 */
function calculateIntervalAmounts(
  latestPaymentSpentAmounts: OutgoingPaymentGrantSpentAmounts,
  latestIntervalSpentAmounts: OutgoingPaymentGrantSpentAmounts | null,
  debitAmountDifference: bigint,
  receiveAmountDifference: bigint
): { debit: bigint | null; receive: bigint | null } {
  if (
    latestPaymentSpentAmounts.intervalStart === null ||
    latestPaymentSpentAmounts.intervalEnd === null ||
    !latestIntervalSpentAmounts
  ) {
    return { debit: null, receive: null }
  }

  const newDebit =
    (latestIntervalSpentAmounts.intervalDebitAmountValue ?? 0n) -
    debitAmountDifference
  const newReceive =
    (latestIntervalSpentAmounts.intervalReceiveAmountValue ?? 0n) -
    receiveAmountDifference

  return {
    debit: BigInt(Math.max(0, Number(newDebit))),
    receive: BigInt(Math.max(0, Number(newReceive)))
  }
}

/**
 * Compares the final settled amounts with the amounts on hold
 * and inserts a new OutgoingPaymentGrantSpentAmount record if needed.
 */
export async function updateGrantSpentAmounts(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  finalAmounts: { debit: bigint; receive: bigint }
) {
  if (!payment.grantId) return

  const latestPaymentSpentAmounts = await getLatestPaymentSpentAmounts(
    deps,
    payment.id
  )
  if (!latestPaymentSpentAmounts) {
    deps.logger.error(
      { payment, latestPaymentSpentAmounts },
      'Could not find grant spent amounts for payment when updating spent amounts'
    )
    return
  }

  const reservedReceiveAmount =
    latestPaymentSpentAmounts.paymentReceiveAmountValue
  const receiveAmountDifference = reservedReceiveAmount - finalAmounts.receive

  if (receiveAmountDifference === 0n) return

  const records = await getRemainingGrantSpentAmounts(
    deps,
    payment.grantId,
    latestPaymentSpentAmounts
  )
  if (!records) {
    deps.logger.error(
      { payment, latestPaymentSpentAmounts },
      'Could not find grant spent amounts for grant when reverting spent amounts'
    )
    return
  }

  const { latestGrantSpentAmounts, latestIntervalSpentAmounts } = records

  const newGrantTotalReceiveAmountValue = BigInt(
    Math.max(
      0,
      Number(
        latestGrantSpentAmounts.grantTotalReceiveAmountValue -
          receiveAmountDifference
      )
    )
  )

  const {
    debit: newIntervalDebitAmountValue,
    receive: newIntervalReceiveAmountValue
  } = calculateIntervalAmounts(
    latestPaymentSpentAmounts,
    latestIntervalSpentAmounts,
    0n,
    receiveAmountDifference
  )

  await OutgoingPaymentGrantSpentAmounts.query(deps.knex).insert({
    id: uuid(),
    grantId: latestPaymentSpentAmounts.grantId,
    outgoingPaymentId: payment.id,
    paymentDebitAmountValue: finalAmounts.debit,
    debitAmountScale: latestPaymentSpentAmounts.debitAmountScale,
    debitAmountCode: latestPaymentSpentAmounts.debitAmountCode,
    intervalDebitAmountValue: newIntervalDebitAmountValue,
    grantTotalDebitAmountValue:
      latestGrantSpentAmounts.grantTotalDebitAmountValue,
    paymentReceiveAmountValue: finalAmounts.receive,
    receiveAmountScale: latestPaymentSpentAmounts.receiveAmountScale,
    receiveAmountCode: latestPaymentSpentAmounts.receiveAmountCode,
    intervalReceiveAmountValue: newIntervalReceiveAmountValue,
    grantTotalReceiveAmountValue: newGrantTotalReceiveAmountValue,
    intervalStart: latestPaymentSpentAmounts.intervalStart,
    intervalEnd: latestPaymentSpentAmounts.intervalEnd,
    createdAt: new Date(),
    paymentState: OutgoingPaymentState.Completed
  })
}

/**
 * Gets the spent amounts for a grant.
 * The spent amounts are scoped to current interval, if any, else they are
 * for the total lifetime of the grant.
 */
async function getGrantSpentAmounts(
  deps: ServiceDependencies,
  options: { grantId: string; limits?: Limits }
): Promise<GrantSpentAmounts> {
  const { grantId, limits } = options

  // Get the latest spent amounts record for the grant
  const latestGrantSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
    deps.knex
  )
    .where('grantId', grantId)
    .orderBy('createdAt', 'desc')
    .first()

  // If no records exist, return zero amounts
  if (!latestGrantSpentAmounts) {
    return {
      spentDebitAmount: null,
      spentReceiveAmount: null
    }
  }

  // If there's an interval, get the current interval and find the latest record for it
  if (limits?.interval) {
    const now = new Date()
    const currentInterval = getInterval(limits.interval, now)

    if (currentInterval && currentInterval.start && currentInterval.end) {
      // Find the latest record for the current interval
      const currentIntervalSpentAmounts =
        await OutgoingPaymentGrantSpentAmounts.query(deps.knex)
          .where('grantId', grantId)
          .where('intervalStart', currentInterval.start.toJSDate())
          .where('intervalEnd', currentInterval.end.toJSDate())
          .orderBy('createdAt', 'desc')
          .first()

      if (currentIntervalSpentAmounts) {
        return {
          spentDebitAmount: {
            value:
              currentIntervalSpentAmounts.intervalDebitAmountValue ?? BigInt(0),
            assetCode: currentIntervalSpentAmounts.debitAmountCode,
            assetScale: currentIntervalSpentAmounts.debitAmountScale
          },
          spentReceiveAmount: {
            value:
              currentIntervalSpentAmounts.intervalReceiveAmountValue ??
              BigInt(0),
            assetCode: currentIntervalSpentAmounts.receiveAmountCode,
            assetScale: currentIntervalSpentAmounts.receiveAmountScale
          }
        }
      }
    }
  }

  // No interval or no interval record found - return total grant amounts
  return {
    spentDebitAmount: {
      value: latestGrantSpentAmounts.grantTotalDebitAmountValue,
      assetCode: latestGrantSpentAmounts.debitAmountCode,
      assetScale: latestGrantSpentAmounts.debitAmountScale
    },
    spentReceiveAmount: {
      value: latestGrantSpentAmounts.grantTotalReceiveAmountValue,
      assetCode: latestGrantSpentAmounts.receiveAmountCode,
      assetScale: latestGrantSpentAmounts.receiveAmountScale
    }
  }
}

/**
 * Reverts the grant spent amounts when a payment fails.
 * Inserts a spent amount record with the reserved amounts adjusted out.
 */
export async function revertGrantSpentAmounts(
  deps: ServiceDependencies,
  payment: OutgoingPayment
): Promise<void> {
  if (!payment.grantId) return

  const latestPaymentSpentAmounts = await getLatestPaymentSpentAmounts(
    deps,
    payment.id
  )
  if (!latestPaymentSpentAmounts) {
    deps.logger.error(
      { payment },
      'Could not find grant spent amounts by payment when reverting spent amounts'
    )
    return
  }

  const records = await getRemainingGrantSpentAmounts(
    deps,
    payment.grantId,
    latestPaymentSpentAmounts
  )
  if (!records) {
    deps.logger.error(
      { payment, latestPaymentSpentAmounts },
      'Could not find grant spent amounts for grant when reverting spent amounts'
    )
    return
  }

  const { latestGrantSpentAmounts, latestIntervalSpentAmounts } = records

  const reservedDebitAmount = latestPaymentSpentAmounts.paymentDebitAmountValue
  const reservedReceiveAmount =
    latestPaymentSpentAmounts.paymentReceiveAmountValue

  const newGrantTotalDebitAmountValue = BigInt(
    Math.max(
      0,
      Number(
        latestGrantSpentAmounts.grantTotalDebitAmountValue - reservedDebitAmount
      )
    )
  )
  const newGrantTotalReceiveAmountValue = BigInt(
    Math.max(
      0,
      Number(
        latestGrantSpentAmounts.grantTotalReceiveAmountValue -
          reservedReceiveAmount
      )
    )
  )

  const {
    debit: newIntervalDebitAmountValue,
    receive: newIntervalReceiveAmountValue
  } = calculateIntervalAmounts(
    latestPaymentSpentAmounts,
    latestIntervalSpentAmounts,
    reservedDebitAmount,
    reservedReceiveAmount
  )

  await OutgoingPaymentGrantSpentAmounts.query(deps.knex).insert({
    id: uuid(),
    grantId: latestPaymentSpentAmounts.grantId,
    outgoingPaymentId: payment.id,
    paymentDebitAmountValue: BigInt(0),
    debitAmountScale: latestPaymentSpentAmounts.debitAmountScale,
    debitAmountCode: latestPaymentSpentAmounts.debitAmountCode,
    intervalDebitAmountValue: newIntervalDebitAmountValue,
    grantTotalDebitAmountValue: newGrantTotalDebitAmountValue,
    paymentReceiveAmountValue: BigInt(0),
    receiveAmountScale: latestPaymentSpentAmounts.receiveAmountScale,
    receiveAmountCode: latestPaymentSpentAmounts.receiveAmountCode,
    intervalReceiveAmountValue: newIntervalReceiveAmountValue,
    grantTotalReceiveAmountValue: newGrantTotalReceiveAmountValue,
    createdAt: new Date(),
    paymentState: payment.state,
    intervalStart: latestPaymentSpentAmounts.intervalStart,
    intervalEnd: latestPaymentSpentAmounts.intervalEnd
  })
}
