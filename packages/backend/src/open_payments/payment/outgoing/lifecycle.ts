import { LifecycleError } from './errors'
import {
  OutgoingPayment,
  OutgoingPaymentState,
  OutgoingPaymentEvent,
  OutgoingPaymentEventType
} from './model'
import { ServiceDependencies } from './service'
import { Receiver } from '../../receiver/model'
import { TransactionOrKnex } from 'objection'
import { ValueType } from '@opentelemetry/api'

// "payment" is locked by the "deps.knex" transaction.
export async function handleSending(
  deps: ServiceDependencies,
  payment: OutgoingPayment
): Promise<void> {
  if (!payment.quote) throw LifecycleError.MissingQuote

  const receiver = await deps.receiverService.get(payment.receiver)

  // TODO: Query TigerBeetle transfers by code to distinguish sending debits from withdrawals
  const amountSent = await deps.accountingService.getTotalSent(payment.id)
  if (amountSent === undefined) {
    throw LifecycleError.MissingBalance
  }

  if (!receiver) {
    // Payment is already (unexpectedly) done. Maybe this is a retry and the previous attempt failed to save the state to Postgres. Or the incoming payment could have been paid by a totally different payment in the time since the quote.
    deps.logger.warn(
      {
        amountSent
      },
      'handleSending missing or completed/expired receiver'
    )
    await handleCompleted(deps, payment)
    return
  }

  validateAssets(deps, payment, receiver)

  // Due to SENDING→SENDING retries, the quote's amount parameters may need adjusting.
  const { maxReceiveAmount, maxDebitAmount } = getAdjustedAmounts(
    deps,
    payment,
    receiver,
    amountSent
  )

  if (maxReceiveAmount <= BigInt(0)) {
    // Payment is already (unexpectedly) done.
    // Maybe this is a retry and the previous attempt failed to save the state to Postgres. Or the incoming payment could have been paid by a totally different payment in the time since the quote.
    deps.logger.warn(
      {
        maxDebitAmount,
        maxReceiveAmount,
        amountSent,
        receiver
      },
      'handleSending payment was already paid'
    )
    await handleCompleted(deps, payment)
    return
  }

  if (maxDebitAmount <= BigInt(0)) {
    // Similar to the above, but not recoverable (at least not without a re-quote).
    // I'm not sure whether this case is actually reachable, but handling it here is clearer than passing in bad parameters.
    deps.logger.error(
      {
        maxDebitAmount,
        maxReceiveAmount
      },
      'handleSending bad retry state'
    )
    throw LifecycleError.BadState
  }

  const stopTimer = deps.telemetry?.startTimer('ilp_pay_time_ms', {
    description: 'Time to complete an ILP payment',
    callName: 'paymentMethodHandlerService.pay (ILP)'
  })

  await deps.paymentMethodHandlerService.pay('ILP', {
    receiver,
    outgoingPayment: payment,
    finalDebitAmount: maxDebitAmount,
    finalReceiveAmount: maxReceiveAmount
  })

  stopTimer && stopTimer()
  if (deps.telemetry) {
    await Promise.all([
      deps.telemetry.incrementCounter('transactions_total', 1, {
        description: 'Count of funded transactions'
      }),
      deps.telemetry.incrementCounterWithTransactionAmountDifference(
        'transaction_fee_amounts',
        payment.sentAmount,
        payment.receiveAmount,
        {
          description: 'Amount sent through the network as fees',
          valueType: ValueType.DOUBLE
        }
      )
    ])
  }

  await handleCompleted(deps, payment)
}

function getAdjustedAmounts(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  receiver: Receiver,
  alreadySentAmount: bigint
): { maxDebitAmount: bigint; maxReceiveAmount: bigint } {
  const maxDebitAmount = payment.debitAmount.value - alreadySentAmount

  // This is only an approximation of the true amount delivered due to exchange rate variance. Due to connection failures there isn't a reliable way to track that in sync with the amount sent (particularly within ILP payments)
  // eslint-disable-next-line no-case-declarations
  const amountDelivered = BigInt(
    Math.ceil(
      Number(alreadySentAmount) *
        (payment.quote.estimatedExchangeRate ||
          payment.quote.lowEstimatedExchangeRate.valueOf())
    )
  )
  let maxReceiveAmount = payment.receiveAmount.value - amountDelivered

  if (receiver.incomingAmount && receiver.receivedAmount) {
    const maxAmountToDeliver =
      receiver.incomingAmount.value - receiver.receivedAmount.value
    if (maxAmountToDeliver < maxReceiveAmount) {
      maxReceiveAmount = maxAmountToDeliver
    }
  }

  return { maxDebitAmount, maxReceiveAmount }
}

export async function handleFailed(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  error: string
): Promise<void> {
  const stopTimer = deps.telemetry?.startTimer('handleFailed', {
    callName: 'handleFailed'
  })
  await payment.$query(deps.knex).patch({
    state: OutgoingPaymentState.Failed,
    error
  })
  await sendWebhookEvent(deps, payment, OutgoingPaymentEventType.PaymentFailed)
  stopTimer && stopTimer()
}

async function handleCompleted(
  deps: ServiceDependencies,
  payment: OutgoingPayment
): Promise<void> {
  const stopTimer = deps.telemetry?.startTimer('handleCompleted', {
    callName: 'handleCompleted'
  })
  await payment.$query(deps.knex).patch({
    state: OutgoingPaymentState.Completed
  })

  await sendWebhookEvent(
    deps,
    payment,
    OutgoingPaymentEventType.PaymentCompleted
  )
  stopTimer && stopTimer()
}

export async function sendWebhookEvent(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  type: OutgoingPaymentEventType,
  trx?: TransactionOrKnex
): Promise<void> {
  const stopTimer = deps.telemetry?.startTimer('sendWebhookEvent', {
    callName: 'outgoingPaymentLifecycle_sendwebhookEvent'
  })
  // TigerBeetle accounts are only created as the OutgoingPayment is funded.
  // So default the amountSent and balance to 0 for outgoing payments still in the funding state
  const amountSent =
    payment.state === OutgoingPaymentState.Funding
      ? BigInt(0)
      : await deps.accountingService.getTotalSent(payment.id)
  const balance =
    payment.state === OutgoingPaymentState.Funding
      ? BigInt(0)
      : await deps.accountingService.getBalance(payment.id)

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

  await OutgoingPaymentEvent.query(trx || deps.knex).insert({
    outgoingPaymentId: payment.id,
    type,
    data: payment.toData({ amountSent, balance }),
    withdrawal
  })
  stopTimer && stopTimer()
}

function validateAssets(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  receiver: Receiver
): void {
  if (payment.assetId !== payment.walletAddress?.assetId) {
    throw LifecycleError.SourceAssetConflict
  }
  if (
    payment.receiveAmount.assetScale !== receiver.assetScale ||
    payment.receiveAmount.assetCode !== receiver.assetCode
  ) {
    deps.logger.warn(
      {
        oldAsset: payment.receiveAmount,
        newAsset: receiver.asset
      },
      'receiver asset changed'
    )
    throw LifecycleError.DestinationAssetConflict
  }
}
