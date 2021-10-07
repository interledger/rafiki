import * as assert from 'assert'
import * as Pay from '@interledger/pay'
import { OutgoingPayment, PaymentState } from './model'
import { ServiceDependencies } from './service'
import { IlpPlugin } from './ilp_plugin'
import { TransferError } from '../transfer/errors'

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
  // Error from the account service, except an InsufficientBalance. (see: TransferError)
  AccountServiceError = 'AccountServiceError',
  // Edge error due to retries, partial payment, and database write errors.
  BadState = 'BadState',

  // These errors shouldn't ever trigger (impossible states), but they exist to satisfy types:
  MissingAccount = 'MissingAccount',
  MissingBalance = 'MissingBalance',
  MissingQuote = 'MissingQuote',
  MissingInvoice = 'MissingInvoice',
  InvalidRatio = 'InvalidRatio'
}

// Acquire a quote for the user to approve.
// "payment" is locked by the "deps.knex" transaction.
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

  // This is the amount of money *remaining* to send, which may be less than the payment intent's amountToSend due to retries (FixedSend payments only).
  let amountToSend: bigint | undefined
  if (payment.intent.amountToSend) {
    const balance = await deps.accountService.getBalance(payment.accountId)
    if (!balance) {
      throw LifecycleError.MissingBalance
    }
    const reservedBalance = await deps.balanceService.get([
      payment.reservedBalanceId
    ])
    if (!reservedBalance) {
      throw LifecycleError.MissingBalance
    }
    const amountSent = reservedBalance[0].balance - balance.balance
    amountToSend = payment.intent.amountToSend - amountSent
    if (amountToSend <= BigInt(0)) {
      // The FixedSend payment completed (in Tigerbeetle) but the backend's update to state=Completed didn't commit. Then the payment retried and ended up here.
      // This error is extremely unlikely to happen, but it can recover gracefully(ish) by shortcutting to the Completed state.
      deps.logger.error(
        {
          amountToSend,
          intentAmountToSend: payment.intent.amountToSend,
          amountSent
        },
        'quote amountToSend bounds error'
      )
      await paymentCompleted(deps, payment)
      return
    }
  }

  const quote = await Pay.startQuote({
    plugin,
    destination,
    sourceAsset: {
      scale: payment.sourceAccount.scale,
      code: payment.sourceAccount.code
    },
    amountToSend,
    slippage: deps.slippage,
    prices
  })
    .finally(() => {
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
    .catch(async (err) => {
      if (err === Pay.PaymentError.InvoiceAlreadyPaid) return null
      throw err
    })
  // InvoiceAlreadyPaid: the invoice was already paid, either by this payment (which retried due to a failed Sending→Completed transition commit) or another payment entirely.
  if (quote === null) {
    deps.logger.warn('quote invoice already paid')
    await paymentCompleted(deps, payment)
    return
  }

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
      minExchangeRate: quote.minExchangeRate,
      lowExchangeRateEstimate: quote.lowEstimatedExchangeRate,
      highExchangeRateEstimate: quote.highEstimatedExchangeRate
    }
  })
}

// "payment" is locked by the "deps.knex" transaction.
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

// "payment" is locked by the "deps.knex" transaction.
export async function handleActivation(
  deps: ServiceDependencies,
  payment: OutgoingPayment
): Promise<void> {
  if (!payment.quote) throw LifecycleError.MissingQuote
  if (payment.quote.activationDeadline < new Date()) {
    throw LifecycleError.QuoteExpired
  }

  await refundLeftoverBalance(deps, payment)
  const sourceAccount = await deps.accountService.get(payment.sourceAccount.id)
  const account = await deps.accountService.get(payment.accountId)
  if (!sourceAccount || !account) {
    throw LifecycleError.MissingAccount
  }
  const error = await deps.transferService.create([
    {
      sourceBalanceId: sourceAccount.balanceId,
      destinationBalanceId: account.balanceId,
      amount: payment.quote.maxSourceAmount
    },
    {
      sourceBalanceId: sourceAccount.asset.outgoingPaymentsBalanceId,
      destinationBalanceId: payment.reservedBalanceId,
      amount: payment.quote.maxSourceAmount
    }
  ])
  if (error) {
    if (
      error.index === 0 &&
      error.error === TransferError.InsufficientBalance
    ) {
      throw LifecycleError.InsufficientBalance
    }

    // Unexpected account service errors: the money was not reserved.
    deps.logger.warn(
      {
        error
      },
      'reserve transfer error'
    )
    throw LifecycleError.AccountServiceError
  }
  await payment.$query(deps.knex).patch({ state: PaymentState.Sending })
}

// "payment" is locked by the "deps.knex" transaction.
export async function handleSending(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  plugin: IlpPlugin
): Promise<void> {
  if (!payment.quote) throw LifecycleError.MissingQuote

  const destination = await Pay.setupPayment({
    plugin,
    paymentPointer: payment.intent.paymentPointer,
    invoiceUrl: payment.intent.invoiceUrl
  })
  const balance = await deps.accountService.getBalance(payment.accountId)
  if (!balance) {
    throw LifecycleError.MissingBalance
  }

  // Due to Sending→Sending retries, the quote's amount parameters may need adjusting.
  const amountSentSinceQuote = payment.quote.maxSourceAmount - balance.balance
  const newMaxSourceAmount = balance.balance

  let newMinDeliveryAmount
  switch (payment.quote.targetType) {
    case Pay.PaymentType.FixedSend:
      // This is only an approximation of the true amount delivered due to exchange rate variance. The true amount delivered is returned on stream response packets, but due to connection failures there isn't a reliable way to track that in sync with the amount sent.
      // eslint-disable-next-line no-case-declarations
      const amountDeliveredSinceQuote = BigInt(
        Math.ceil(
          +amountSentSinceQuote.toString() *
            payment.quote.minExchangeRate.valueOf()
        )
      )
      newMinDeliveryAmount =
        payment.quote.minDeliveryAmount - amountDeliveredSinceQuote
      break
    case Pay.PaymentType.FixedDelivery:
      if (!destination.invoice) throw LifecycleError.MissingInvoice
      newMinDeliveryAmount =
        destination.invoice.amountToDeliver -
        destination.invoice.amountDelivered
      break
  }

  if (
    (payment.quote.targetType === Pay.PaymentType.FixedSend &&
      newMaxSourceAmount <= BigInt(0)) ||
    (payment.quote.targetType === Pay.PaymentType.FixedDelivery &&
      newMinDeliveryAmount <= BigInt(0))
  ) {
    // Payment is already (unexpectedly) done. Maybe this is a retry and the previous attempt failed to save the state to Postgres. Or the invoice could have been paid by a totally different payment in the time since the quote.
    deps.logger.warn(
      {
        newMaxSourceAmount,
        newMinDeliveryAmount,
        paymentType: payment.quote.targetType,
        amountSentSinceQuote,
        invoice: destination.invoice
      },
      'handleSending payment was already paid'
    )
    await paymentCompleted(deps, payment)
    return
  } else if (
    newMaxSourceAmount <= BigInt(0) ||
    newMinDeliveryAmount <= BigInt(0)
  ) {
    // Similar to the above, but not recoverable (at least not without a re-quote).
    // I'm not sure whether this case is actually reachable, but handling it here is clearer than passing ilp-pay bad parameters.
    deps.logger.error(
      {
        newMaxSourceAmount,
        newMinDeliveryAmount,
        paymentType: payment.quote.targetType
      },
      'handleSending bad retry state'
    )
    throw LifecycleError.BadState
  }

  const lowEstimatedExchangeRate = payment.quote.lowExchangeRateEstimate
  const highEstimatedExchangeRate = payment.quote.highExchangeRateEstimate
  const minExchangeRate = payment.quote.minExchangeRate
  if (!highEstimatedExchangeRate.isPositive()) {
    // This shouldn't ever happen, since the rate is correct when they are stored during the quoting stage.
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
    maxSourceAmount: newMaxSourceAmount,
    minDeliveryAmount: newMinDeliveryAmount,
    maxPacketAmount: payment.quote.maxPacketAmount,
    lowEstimatedExchangeRate,
    highEstimatedExchangeRate,
    minExchangeRate
  }

  const receipt = await Pay.pay({ plugin, destination, quote }).finally(() => {
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

  deps.logger.debug(
    {
      destination: destination.destinationAddress,
      error: receipt.error,
      paymentType: payment.quote.targetType,
      newMaxSourceAmount,
      newMinDeliveryAmount,
      receiptAmountSent: receipt.amountSent,
      receiptAmountDelivered: receipt.amountDelivered
    },
    'payed'
  )

  if (receipt.error) throw receipt.error
  await paymentCompleted(deps, payment)
}

// "payment" is locked by the "deps.knex" transaction.
export async function handleCancelling(
  deps: ServiceDependencies,
  payment: OutgoingPayment
): Promise<void> {
  await refundLeftoverBalance(deps, payment)
  await payment.$query(deps.knex).patch({ state: PaymentState.Cancelled })
}

async function paymentCompleted(
  deps: ServiceDependencies,
  payment: OutgoingPayment
): Promise<void> {
  // Restore leftover reserved money to the parent account.
  await refundLeftoverBalance(deps, payment)
  await payment.$query(deps.knex).patch({ state: PaymentState.Completed })
}

// Refund money in the subaccount to the parent account.
async function refundLeftoverBalance(
  deps: ServiceDependencies,
  payment: OutgoingPayment
): Promise<void> {
  const balance = await deps.accountService.getBalance(payment.accountId)
  if (!balance) {
    throw LifecycleError.MissingBalance
  }
  if (balance.balance === BigInt(0)) return

  const account = await deps.accountService.get(payment.accountId)
  const sourceAccount = await deps.accountService.get(payment.sourceAccount.id)
  if (!account || !sourceAccount) {
    throw LifecycleError.MissingAccount
  }
  const error = await deps.transferService.create([
    {
      sourceBalanceId: account.balanceId,
      destinationBalanceId: sourceAccount.balanceId,
      amount: balance.balance
    },
    {
      sourceBalanceId: payment.reservedBalanceId,
      destinationBalanceId: sourceAccount.asset.outgoingPaymentsBalanceId,
      amount: balance.balance
    }
  ])
  if (error) {
    deps.logger.warn(
      {
        error
      },
      'refund transfer error'
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
