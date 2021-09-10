import * as assert from 'assert'
import * as Pay from '@interledger/pay'
import { debounce } from 'debounce'
import { OutgoingPayment, PaymentState } from './model'
import { ServiceDependencies } from './service'
import { IlpPlugin } from './ilp_plugin'

// Minimum interval between progress updates.
const PROGRESS_UPDATE_INTERVAL = 200 // milliseconds
const MAX_INT64 = BigInt('9223372036854775807')

export type PaymentError = LifecycleError | Pay.PaymentError
export enum LifecycleError {
  QuoteExpired = 'QuoteExpired',
  // Rate fetch failed.
  PricesUnavailable = 'PricesUnavailable',
  // Payment aborted via "cancel payment" API call.
  CancelledByAPI = 'CancelledByAPI',
  // Not enough money in the super-account.
  InsufficientBalance = 'InsufficientBalance',
  // Error from the account service, except an InsufficientBalance. (see: CreditError)
  AccountServiceError = 'AccountServiceError',

  // These errors shouldn't ever trigger (impossible states), but they exist to satisfy types:
  MissingQuote = 'MissingQuote',
  InvalidRatio = 'InvalidRatio'
}

export async function handleQuoting(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  plugin: IlpPlugin
): Promise<void> {
  const prices = await deps.ratesService.prices().catch((_err: Error) => {
    throw LifecycleError.PricesUnavailable
  })

  const destination = await Pay.setupPayment({
    plugin,
    paymentPointer: payment.intent.paymentPointer,
    invoiceUrl: payment.intent.invoiceUrl
  })

  assert.equal(
    destination.destinationAsset.scale,
    payment.destinationAccount.scale,
    'destination scale mismatch'
  )
  assert.equal(
    destination.destinationAsset.code,
    payment.destinationAccount.code,
    'destination code mismatch'
  )

  const quote = await Pay.startQuote({
    plugin,
    destination,
    sourceAsset: {
      scale: payment.sourceAccount.scale,
      code: payment.sourceAccount.code
    },
    // This is always the full payment amount, even when part of that amount has already successfully been delivered.
    // The quote's amounts are adjusted in `handleSending` to reflect the actual payment state.
    amountToSend: payment.intent.amountToSend,
    slippage: deps.slippage,
    prices
  }).finally(() => {
    return Pay.closeConnection(plugin, destination).catch((err) => {
      deps.logger.warn(
        {
          destination: destination.destinationAddress,
          error: err.message
        },
        'close quote connection failed'
      )
    })
  })

  await payment.$query(deps.knex).patch({
    state: PaymentState.Ready,
    quote: {
      timestamp: new Date(),
      activationDeadline: new Date(Date.now() + deps.quoteLifespan),
      targetType: quote.paymentType,
      minDeliveryAmount: quote.minDeliveryAmount,
      maxSourceAmount: quote.maxSourceAmount,
      // Cap at MAX_INT64 because of postgres type limits.
      maxPacketAmount:
        MAX_INT64 < quote.maxPacketAmount ? MAX_INT64 : quote.maxPacketAmount,
      minExchangeRate: quote.minExchangeRate.valueOf(),
      lowExchangeRateEstimate: quote.lowEstimatedExchangeRate.valueOf(),
      highExchangeRateEstimate: quote.highEstimatedExchangeRate.valueOf()
      //estimatedDuration: quote.estimatedDuration,
    }
  })
}

export async function handleReady(
  deps: ServiceDependencies,
  payment: OutgoingPayment
): Promise<void> {
  if (!payment.quote) throw LifecycleError.MissingQuote
  const now = new Date()
  if (payment.quote.activationDeadline < now) {
    throw LifecycleError.QuoteExpired
  }
  if (payment.intent.autoApprove) {
    await payment.$query(deps.knex).patch({ state: PaymentState.Activated })
    deps.logger.debug('auto-approve')
    return
  }
  deps.logger.error(
    {
      activationDeadline: payment.quote.activationDeadline.getTime(),
      now: now.getTime(),
      autoApprove: payment.intent.autoApprove
    },
    "handleReady for payment that isn't ready"
  )
}

export async function handleActivation(
  deps: ServiceDependencies,
  payment: OutgoingPayment
): Promise<void> {
  if (!payment.quote) throw LifecycleError.MissingQuote
  if (payment.quote.activationDeadline < new Date()) {
    throw LifecycleError.QuoteExpired
  }

  await refundLeftoverBalance(deps, payment)
  const extendRes = await deps.connectorService.extendCredit({
    accountId: payment.superAccountId,
    subAccountId: payment.sourceAccount.id,
    amount: payment.quote.maxSourceAmount,
    autoApply: true
  })
  if (extendRes.error === 'InsufficientBalance') {
    throw LifecycleError.InsufficientBalance
  } else if (!extendRes.success) {
    // Unexpected account service errors: the money was not reserved.
    deps.logger.warn(
      {
        code: extendRes.code,
        message: extendRes.message,
        error: extendRes.error
      },
      'extend credit error'
    )
    throw LifecycleError.AccountServiceError
  }
  await payment.$query(deps.knex).patch({ state: PaymentState.Sending })
}

export async function handleSending(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  plugin: IlpPlugin
): Promise<void> {
  if (!payment.quote) throw LifecycleError.MissingQuote
  const progress =
    (await deps.paymentProgressService.get(payment.id)) ||
    (await deps.paymentProgressService.create(payment.id))
  const baseAmountSent = progress.amountSent
  const baseAmountDelivered = progress.amountDelivered

  const destination = await Pay.setupPayment({
    plugin,
    paymentPointer: payment.intent.paymentPointer,
    invoiceUrl: payment.intent.invoiceUrl
  })

  const updateProgress = (receipt: Pay.PaymentProgress): Promise<void> =>
    deps.paymentProgressService.increase(payment.id, {
      amountSent: baseAmountSent + receipt.amountSent,
      amountDelivered: baseAmountDelivered + receipt.amountDelivered
    })

  const lastAmountSent = baseAmountSent
  const lastAmountDelivered = baseAmountDelivered
  // Debounce progress updates so that a tiny max-packet-amount doesn't trigger a flood of updates.
  const progressHandler = debounce((receipt: Pay.PaymentProgress): void => {
    if (
      lastAmountSent === receipt.amountSent &&
      lastAmountDelivered === receipt.amountDelivered
    ) {
      // The only changes are the receipt's in-flight amounts, so don't update the payment progress.
      return
    }
    // These updates occur in a separate transaction from the OutgoingPayment, so they commit immediately.
    // They are still implicitly protected from race conditions via the OutgoingPayment's SELECT FOR UPDATE.
    updates = updates.finally(() =>
      updateProgress(receipt).catch((err) => {
        deps.logger.warn(
          {
            amountSent: baseAmountSent + receipt.amountSent,
            amountDelivered: baseAmountDelivered + receipt.amountDelivered,
            error: err.message
          },
          'error updating progress'
        )
      })
    )
  }, PROGRESS_UPDATE_INTERVAL)

  const lowEstimatedExchangeRate = Pay.Ratio.from(
    payment.quote.lowExchangeRateEstimate
  )
  const highEstimatedExchangeRate = Pay.Ratio.from(
    payment.quote.highExchangeRateEstimate
  )
  const minExchangeRate = Pay.Ratio.from(payment.quote.minExchangeRate)
  if (
    !lowEstimatedExchangeRate ||
    !highEstimatedExchangeRate ||
    !highEstimatedExchangeRate.isPositive() ||
    !minExchangeRate
  ) {
    // This shouldn't ever happen, since the rates are correct when they are stored during the quoting stage.
    deps.logger.error(
      {
        lowEstimatedExchangeRate,
        highEstimatedExchangeRate,
        minExchangeRate
      },
      'invalid estimated rate'
    )
    throw LifecycleError.InvalidRatio
  }
  const quote = {
    paymentType: payment.quote.targetType,
    // Adjust quoted amounts to account for prior partial payment.
    maxSourceAmount: payment.quote.maxSourceAmount - baseAmountSent,
    minDeliveryAmount: payment.quote.minDeliveryAmount - baseAmountDelivered,
    maxPacketAmount: payment.quote.maxPacketAmount,
    lowEstimatedExchangeRate,
    highEstimatedExchangeRate,
    minExchangeRate
  }

  let updates = Promise.resolve()
  // The "maxSourceAmount" is 0 when the payment is already fully paid, but the last attempt's transaction just didn't commit.
  const receipt =
    quote.maxSourceAmount === BigInt(0)
      ? {
          amountSent: BigInt(0),
          amountDelivered: BigInt(0),
          sourceAmountInFlight: BigInt(0),
          destinationAmountInFlight: BigInt(0)
        }
      : await Pay.pay({
          plugin,
          destination,
          quote,
          progressHandler
        })
          .finally(async () => {
            progressHandler.flush()
            // Wait for updates to finish to avoid a race where it could update
            // outside the protection of the locked payment.
            await updates
          })
          .finally(() => {
            return Pay.closeConnection(plugin, destination).catch((err) => {
              // Ignore connection close failures, all of the money was delivered.
              deps.logger.warn(
                {
                  destination: destination.destinationAddress,
                  error: err.message
                },
                'close pay connection failed'
              )
            })
          })
  // The other updates are allowed to fail (since there will be more).
  // This last update *must* succeed before the payment state is updated.
  await updateProgress(receipt)

  const outcomeAmountSent = baseAmountSent + receipt.amountSent
  const outcomeAmountDelivered = baseAmountDelivered + receipt.amountDelivered
  deps.logger.debug(
    {
      destination: destination.destinationAddress,
      error: receipt.error,
      outcomeAmountSent,
      outcomeAmountDelivered,
      receiptAmountSent: receipt.amountSent,
      receiptAmountDelivered: receipt.amountDelivered
    },
    'payed'
  )

  if (receipt.error) throw receipt.error

  // Restore leftover reserved money to the parent account.
  await refundLeftoverBalance(deps, payment)
  await payment.$query(deps.knex).patch({ state: PaymentState.Completed })
}

export async function handleCancelling(
  deps: ServiceDependencies,
  payment: OutgoingPayment
): Promise<void> {
  await refundLeftoverBalance(deps, payment)
  await payment.$query(deps.knex).patch({ state: PaymentState.Cancelled })
}

// Refund money in the subaccount to the parent account.
async function refundLeftoverBalance(
  deps: ServiceDependencies,
  payment: OutgoingPayment
): Promise<void> {
  const { balance } = await deps.connectorService.getIlpAccount(
    payment.sourceAccount.id
  )
  if (balance.balance === BigInt(0)) return

  const settleRes = await deps.connectorService.settleDebt({
    accountId: payment.superAccountId,
    subAccountId: payment.sourceAccount.id,
    amount: balance.balance,
    revolve: false
  })
  if (!settleRes.success) {
    deps.logger.warn(
      {
        code: settleRes.code,
        message: settleRes.message,
        error: settleRes.error
      },
      'revoke credit error'
    )
    throw LifecycleError.AccountServiceError
  }
}

const retryablePaymentErrors: { [paymentError in PaymentError]?: boolean } = {
  // Lifecycle errors
  PricesUnavailable: true,
  // From @interledger/pay's PaymentError:
  QueryFailed: true,
  ConnectorError: true,
  EstablishmentFailed: true,
  InsufficientExchangeRate: true,
  RateProbeFailed: true,
  IdleTimeout: true,
  ClosedByReceiver: true
}

export function canRetryError(err: Error | PaymentError): boolean {
  return err instanceof Error || !!retryablePaymentErrors[err]
}
