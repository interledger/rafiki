import * as Pay from '@interledger/pay'
import assert from 'assert'

import { LifecycleError } from './errors'
import {
  OutgoingPayment,
  OutgoingPaymentState,
  PaymentEvent,
  PaymentEventType
} from './model'
import { ServiceDependencies } from './service'
import { IlpPlugin } from './ilp_plugin'

const MAX_INT64 = BigInt('9223372036854775807')

// Acquire a quote for the user to approve.
// "payment" is locked by the "deps.knex" transaction.
export async function handlePending(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  plugin: IlpPlugin
): Promise<void> {
  const prices = await deps.ratesService.prices().catch((_err: Error) => {
    throw LifecycleError.PricesUnavailable
  })

  const options: Pay.SetupOptions = { plugin }
  if (payment.receivingPayment) {
    options.destinationPayment = payment.receivingPayment
  } else {
    options.destinationAccount = payment.receivingAccount
    if (payment.receiveAmount) {
      assert.ok(payment.receiveAmount.assetCode)
      assert.ok(payment.receiveAmount.assetScale)
      options.amountToDeliver = {
        value: payment.receiveAmount.value,
        assetCode: payment.receiveAmount.assetCode,
        assetScale: payment.receiveAmount.assetScale
      }
    }
  }
  const destination = await Pay.setupPayment(options)

  if (!payment.receivingPayment) {
    if (!destination.destinationPaymentDetails) {
      throw LifecycleError.MissingIncomingPayment
    }
    await payment.$query(deps.knex).patch({
      receivingPayment: destination.destinationPaymentDetails.id
    })
  }

  validateAssets(deps, payment, destination)

  const quote = await Pay.startQuote({
    plugin,
    destination,
    sourceAsset: {
      scale: payment.asset.scale,
      code: payment.asset.code
    },
    amountToSend: payment.sendAmount?.value,
    amountToDeliver: payment.receiveAmount?.value,
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

  // Pay.startQuote should return PaymentError.InvalidSourceAmount or
  // PaymentError.InvalidDestinationAmount for non-positive amounts.
  // Outgoing payments' sendAmount or receiveAmount should never be
  // zero or negative.
  assert.ok(quote.maxSourceAmount > BigInt(0))
  assert.ok(quote.minDeliveryAmount > BigInt(0))

  await payment.$query(deps.knex).patch({
    state: OutgoingPaymentState.Funding,
    sendAmount: payment.sendAmount || {
      value: quote.maxSourceAmount,
      assetCode: payment.asset.code,
      assetScale: payment.asset.scale
    },
    receiveAmount: {
      value: payment.receiveAmount?.value || quote.minDeliveryAmount,
      assetCode: destination.destinationAsset.code,
      assetScale: destination.destinationAsset.scale
    },
    quote: {
      timestamp: new Date(),
      targetType: quote.paymentType,
      // Cap at MAX_INT64 because of postgres type limits.
      maxPacketAmount:
        MAX_INT64 < quote.maxPacketAmount ? MAX_INT64 : quote.maxPacketAmount,
      minExchangeRate: quote.minExchangeRate,
      lowExchangeRateEstimate: quote.lowEstimatedExchangeRate,
      highExchangeRateEstimate: quote.highEstimatedExchangeRate
    }
  })

  await sendWebhookEvent(deps, payment, PaymentEventType.PaymentFunding)
}

// "payment" is locked by the "deps.knex" transaction.
export async function handleSending(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  plugin: IlpPlugin
): Promise<void> {
  if (!payment.quote) throw LifecycleError.MissingQuote
  if (!payment.sendAmount) throw LifecycleError.MissingSendAmount
  if (!payment.receiveAmount) throw LifecycleError.MissingReceiveAmount

  const destination = await Pay.setupPayment({
    plugin,
    destinationAccount: payment.receivingAccount,
    destinationPayment: payment.receivingPayment
  })

  validateAssets(deps, payment, destination)

  // TODO: Query Tigerbeetle transfers by code to distinguish sending debits from withdrawals
  const amountSent = await deps.accountingService.getTotalSent(payment.id)
  if (amountSent === undefined) {
    throw LifecycleError.MissingBalance
  }

  // Due to SENDING→SENDING retries, the quote's amount parameters may need adjusting.
  const newMaxSourceAmount = payment.sendAmount.value - amountSent

  let newMinDeliveryAmount
  if (
    payment.receivingAccount ||
    (destination.destinationPaymentDetails &&
      !destination.destinationPaymentDetails.incomingAmount)
  ) {
    // This is only an approximation of the true amount delivered due to exchange rate variance. The true amount delivered is returned on stream response packets, but due to connection failures there isn't a reliable way to track that in sync with the amount sent.
    // eslint-disable-next-line no-case-declarations
    const amountDelivered = BigInt(
      Math.ceil(
        +amountSent.toString() * payment.quote.minExchangeRate.valueOf()
      )
    )
    newMinDeliveryAmount = payment.receiveAmount.value - amountDelivered
  } else {
    if (
      destination.destinationPaymentDetails &&
      destination.destinationPaymentDetails.incomingAmount
    ) {
      newMinDeliveryAmount =
        destination.destinationPaymentDetails.incomingAmount.value -
        destination.destinationPaymentDetails.receivedAmount.value
    } else {
      throw LifecycleError.MissingIncomingPayment
    }
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
        amountSent,
        incomingPayment: destination.destinationPaymentDetails
      },
      'handleSending payment was already paid'
    )
    await handleCompleted(deps, payment)
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

  await handleCompleted(deps, payment)
}

export async function handleFailed(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  error: string
): Promise<void> {
  await payment.$query(deps.knex).patch({
    state: OutgoingPaymentState.Failed,
    error
  })
  await sendWebhookEvent(deps, payment, PaymentEventType.PaymentFailed)
}

const handleCompleted = async (
  deps: ServiceDependencies,
  payment: OutgoingPayment
): Promise<void> => {
  await payment.$query(deps.knex).patch({
    state: OutgoingPaymentState.Completed
  })
  await sendWebhookEvent(deps, payment, PaymentEventType.PaymentCompleted)
}

export const sendWebhookEvent = async (
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  type: PaymentEventType
): Promise<void> => {
  const amountSent = await deps.accountingService.getTotalSent(payment.id)
  const balance = await deps.accountingService.getBalance(payment.id)
  if (amountSent === undefined || balance === undefined) {
    throw LifecycleError.MissingBalance
  }

  const withdrawal = balance
    ? {
        accountId: payment.id,
        assetId: payment.assetId,
        amount: balance
      }
    : undefined
  await PaymentEvent.query(deps.knex).insertAndFetch({
    type,
    data: payment.toData({ amountSent, balance }),
    withdrawal
  })
}

const validateAssets = (
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  destination: Pay.ResolvedPayment
): void => {
  if (payment.assetId !== payment.account?.assetId) {
    throw LifecycleError.SourceAssetConflict
  }
  if (payment.receiveAmount) {
    if (
      payment.receiveAmount.assetScale !== destination.destinationAsset.scale ||
      payment.receiveAmount.assetCode !== destination.destinationAsset.code
    ) {
      deps.logger.warn(
        {
          oldAsset: payment.receiveAmount,
          newAsset: destination.destinationAsset
        },
        'destination asset changed'
      )
      throw Pay.PaymentError.DestinationAssetConflict
    }
  }
}
