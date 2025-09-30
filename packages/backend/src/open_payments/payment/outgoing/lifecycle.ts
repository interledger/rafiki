import { LifecycleError } from './errors'
import {
  OutgoingPayment,
  OutgoingPaymentState,
  OutgoingPaymentEvent,
  OutgoingPaymentEventType,
  OutgoingPaymentGrantSpentAmounts
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

  // Check if the current time is greater than or equal to when the Quote should be expiring
  if (Date.now() >= payment.quote.expiresAt.getTime()) {
    throw LifecycleError.QuoteExpired
  }

  const receiver = await deps.receiverService.get(payment.receiver)

  // TODO: Query TigerBeetle transfers by code to distinguish sending debits from withdrawals
  const amountSent = await deps.accountingService.getTotalSent(payment.id)
  if (amountSent === undefined) {
    throw LifecycleError.MissingBalance
  }

  if (!receiver || !receiver.isActive()) {
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

  const stopTimer = deps.telemetry.startTimer('pay_time_ms', {
    description: 'Time to complete a payment',
    callName: 'PaymentMethodHandlerService:pay'
  })
  let receiveAmount: bigint
  if (receiver.isLocal) {
    if (
      !payment.quote.debitAmountMinusFees ||
      payment.quote.debitAmountMinusFees <= BigInt(0)
    ) {
      deps.logger.error(
        {
          debitAmountMinusFees: payment.quote.debitAmountMinusFees
        },
        'handleSending: quote.debitAmountMinusFees invalid'
      )
      throw LifecycleError.BadState
    }
    receiveAmount = await deps.paymentMethodHandlerService.pay('LOCAL', {
      receiver,
      outgoingPayment: payment,
      finalDebitAmount: payment.quote.debitAmountMinusFees,
      finalReceiveAmount: maxReceiveAmount
    })
  } else {
    receiveAmount = await deps.paymentMethodHandlerService.pay('ILP', {
      receiver,
      outgoingPayment: payment,
      finalDebitAmount: maxDebitAmount,
      finalReceiveAmount: maxReceiveAmount
    })
  }
  stopTimer()

  // TODO:
  // compare debit/receiveAmount and add new grant spent amount records if
  // settled amount differs from amount on hold. maybe adapt/use updateGrantSpentAmounts

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
    Math.ceil(Number(alreadySentAmount) * payment.quote.estimatedExchangeRate)
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

// TODO: use or lose
async function updateGrantSpentAmounts(
  deps: ServiceDependencies,
  grantId: string,
  payment: OutgoingPayment,
  failedAt: Date
) {
  // TODO: can i consolidate the edge case query into this one? no interval or first invterval where intervalEnd > payment.createdAt?
  let latestSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
    deps.knex
  )
    .where('grantId', grantId)
    .orderBy('createdAt', 'desc')
    .first()

  // TODO: this shouldnt happen. should we error instead?
  if (!latestSpentAmounts) {
    deps.logger.warn(
      { grantId },
      'No outgoingPaymentGrantSpentAmounts record found for grantId on payment failure'
    )
    return
  }
  // TODO: the edge case
  // edge case: if payment failed after the interval ended, find record where interval > paymentCreatedAt
  if (
    latestSpentAmounts.intervalEnd &&
    failedAt > latestSpentAmounts.intervalEnd
  ) {
    const record = await OutgoingPaymentGrantSpentAmounts.query(deps.knex)
      .where('grantId', grantId)
      .andWhere('intervalEnd', '>', payment.createdAt)
      .orderBy('createdAt', 'desc')
      .first()

    if (record) {
      deps.logger.warn(
        { grantId, failedAt, paymentCreatedAt: payment.createdAt },
        'Payment failed in a later interval than it was created'
      )
    }
    //  TODO: what to do if no record?
  }

  // otherwise, get the most recent record for the grant
  // const latestSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
  //   deps.knex
  // )
  //   .where('grantId', grantId)
  //   .orderBy('createdAt', 'desc')
  //   .first()

  if (latestSpentAmounts) {
    const reservedDebitAmount = latestSpentAmounts.paymentDebitAmountValue
    const settledDebitAmount = await deps.accountingService.getTotalSent(
      payment.id
    )

    if (settledDebitAmount === undefined) {
      // TODO: handle null case better?
      throw new Error(
        `Could not find debit amount for grant spent amount when trying to update grant spent amount for outgoing payment id: ${payment.id}`
      )
    }

    const debitAmountDifference = reservedDebitAmount - settledDebitAmount
    const newGrantTotalDebitAmountValue =
      latestSpentAmounts.grantTotalDebitAmountValue - debitAmountDifference
    const newIntervalDebitAmountValue =
      latestSpentAmounts.intervalDebitAmountValue !== null
        ? latestSpentAmounts.intervalDebitAmountValue - debitAmountDifference
        : latestSpentAmounts.intervalDebitAmountValue

    // TOOD: Also adjust receive amounts

    // TODO: handle case where these new values are negative? presumably that is an invalid state.
    // In practice it may never happen but is theorhetically possible.

    await OutgoingPaymentGrantSpentAmounts.query(deps.knex).insert({
      ...latestSpentAmounts,
      paymentDebitAmountValue: settledDebitAmount,
      intervalDebitAmountValue: newIntervalDebitAmountValue,
      grantTotalDebitAmountValue: newGrantTotalDebitAmountValue,
      paymentState: OutgoingPaymentState.Failed,
      createdAt: new Date()
    })
  } else {
    deps.logger.warn(
      { grantId: payment.grantId },
      'No outgoingPaymentGrantSpentAmounts record found for grantId on payment failure'
    )
  }
}

async function deleteGrantSpentAmounts(
  deps: ServiceDependencies,
  grantId: string
) {
  // TODO: if keeping the delete, soft delete via deletedAt instead
  const latestRecord = await OutgoingPaymentGrantSpentAmounts.query()
    .where('grantId', grantId)
    .orderBy('createdAt', 'desc')
    .first()
  if (latestRecord) {
    await OutgoingPaymentGrantSpentAmounts.query().deleteById(latestRecord.id)
  }
}

export async function handleFailed(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  error: string
): Promise<void> {
  const stopTimer = deps.telemetry.startTimer('handle_failed_ms', {
    callName: 'OutgoingPaymentLifecycle:handleFailed'
  })
  const failedAt = new Date()
  await payment.$query(deps.knex).patch({
    state: OutgoingPaymentState.Failed,
    error,
    updatedAt: failedAt
  })

  if (payment.grantId) {
    deleteGrantSpentAmounts(deps, payment.grantId)
    // updateGrantSpentAmounts(deps, payment.grantId, payment, failedAt)
  }

  await sendWebhookEvent(deps, payment, OutgoingPaymentEventType.PaymentFailed)
  stopTimer()
}

async function handleCompleted(
  deps: ServiceDependencies,
  payment: OutgoingPayment
): Promise<void> {
  const stopTimer = deps.telemetry.startTimer('handle_completed_ms', {
    callName: 'OutgoingPaymentLifecycle:handleCompleted'
  })
  await payment.$query(deps.knex).patch({
    state: OutgoingPaymentState.Completed
  })

  await sendWebhookEvent(
    deps,
    payment,
    OutgoingPaymentEventType.PaymentCompleted
  )
  stopTimer()
}

export async function sendWebhookEvent(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  type: OutgoingPaymentEventType,
  trx?: TransactionOrKnex
): Promise<void> {
  const stopTimer = deps.telemetry.startTimer('op_send_webhook_event_ms', {
    callName: 'OutgoingPaymentLifecycle:sendWebhookEvent'
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
    stopTimer()
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
  stopTimer()
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
