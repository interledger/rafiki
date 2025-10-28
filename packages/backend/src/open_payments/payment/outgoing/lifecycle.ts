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
import { v4 } from 'uuid'
import { PayResult } from '../../../payment-method/handler/service'

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
  let payResult: PayResult
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
    payResult = await deps.paymentMethodHandlerService.pay('LOCAL', {
      receiver,
      outgoingPayment: payment,
      finalDebitAmount: payment.quote.debitAmountMinusFees,
      finalReceiveAmount: maxReceiveAmount
    })
  } else {
    payResult = await deps.paymentMethodHandlerService.pay('ILP', {
      receiver,
      outgoingPayment: payment,
      finalDebitAmount: maxDebitAmount,
      finalReceiveAmount: maxReceiveAmount
    })
  }
  stopTimer()

  updateGrantSpentAmounts(deps, payment, payResult)

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

// TODO: probably rm in favor of seperate revert/handle functions

/**
 * Compares the final settled amounts with the amounts on hold
 * and inserts a new OutgoingPaymentGrantSpentAmount record if needed.
 */
async function handleGrantSpentAmounts(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  finalAmounts: PayResult
) {
  if (!payment.grantId) return

  // Get the latest spent amounts record for this specific payment,
  // not necessarily the latest for this grant
  const latestPaymentSpentAmounts =
    await OutgoingPaymentGrantSpentAmounts.query(deps.knex)
      .where('outgoingPaymentId', payment.id)
      .orderBy('createdAt', 'desc')
      .first()

  // TODO: this shouldnt happen. should we error instead?
  if (!latestPaymentSpentAmounts) {
    deps.logger.warn(
      { outgoingPaymentId: payment.id },
      'No outgoingPaymentGrantSpentAmounts record found for outgoingPaymentId'
    )
    return
  }

  // Detect if partial payment
  // TODO: can partial payments be detected without this grant spent record?
  // Like just from the payment vs. finalAmounts? If so we could remove the latestPaymentSpentAmounts query
  const reservedDebitAmount = latestPaymentSpentAmounts.paymentDebitAmountValue
  const reservedReceiveAmount =
    latestPaymentSpentAmounts.paymentReceiveAmountValue
  const debitAmountDifference = reservedDebitAmount - finalAmounts.debit
  const receiveAmountDifference = reservedReceiveAmount - finalAmounts.receive

  if (debitAmountDifference === 0n && receiveAmountDifference === 0n) return

  // Get the latest spent amounts for this grant (all time)
  const latestGrantSpentAmounts = await OutgoingPaymentGrantSpentAmounts.query(
    deps.knex
  )
    .where('grantId', payment.grantId)
    .orderBy('createdAt', 'desc')
    .first()

  if (!latestGrantSpentAmounts) {
    deps.logger.warn(
      { grantId: payment.grantId },
      'No outgoingPaymentGrantSpentAmounts record found for grantId'
    )
    return
  }

  const newGrantTotalDebitAmountValue =
    latestGrantSpentAmounts.grantTotalDebitAmountValue - debitAmountDifference
  const newGrantTotalReceiveAmountValue =
    latestGrantSpentAmounts.grantTotalReceiveAmountValue -
    receiveAmountDifference

  // TODO: clamp to 0 for rever case?

  // For interval amounts, we need the latest record from this payment's interval
  // (not necessarily the latest overall, nor this specific payment's spent amount record)
  let newIntervalDebitAmountValue: bigint | null = null
  let newIntervalReceiveAmountValue: bigint | null = null

  if (
    latestPaymentSpentAmounts.intervalStart !== null &&
    latestPaymentSpentAmounts.intervalEnd !== null
  ) {
    const isWithinSameInterval =
      latestGrantSpentAmounts.intervalStart?.getTime() ===
        latestPaymentSpentAmounts.intervalStart.getTime() &&
      latestGrantSpentAmounts.intervalEnd?.getTime() ===
        latestPaymentSpentAmounts.intervalEnd.getTime()

    if (isWithinSameInterval) {
      // We're still in the same interval, so use the latest grant spent amounts
      newIntervalDebitAmountValue =
        (latestGrantSpentAmounts.intervalDebitAmountValue ?? 0n) -
        debitAmountDifference
      newIntervalReceiveAmountValue =
        (latestGrantSpentAmounts.intervalReceiveAmountValue ?? 0n) -
        receiveAmountDifference
    } else {
      // We're in a different interval, need to query for the latest interval spent amounts
      const latestIntervalSpentAmounts =
        await OutgoingPaymentGrantSpentAmounts.query(deps.knex)
          .where('grantId', payment.grantId)
          .where('intervalStart', latestPaymentSpentAmounts.intervalStart)
          .where('intervalEnd', latestPaymentSpentAmounts.intervalEnd)
          .orderBy('createdAt', 'desc')
          .first()

      if (!latestIntervalSpentAmounts) {
        deps.logger.warn(
          {
            grantId: payment.grantId,
            intervalStart: latestPaymentSpentAmounts.intervalStart,
            intervalEnd: latestPaymentSpentAmounts.intervalEnd
          },
          'No outgoingPaymentGrantSpentAmounts record found for grant interval'
        )
        return
      }

      newIntervalDebitAmountValue =
        (latestIntervalSpentAmounts.intervalDebitAmountValue ?? 0n) -
        debitAmountDifference
      newIntervalReceiveAmountValue =
        (latestIntervalSpentAmounts.intervalReceiveAmountValue ?? 0n) -
        receiveAmountDifference
    }
  }

  await OutgoingPaymentGrantSpentAmounts.query(deps.knex).insert({
    ...latestPaymentSpentAmounts,
    id: v4(),
    outgoingPaymentId: payment.id,
    paymentDebitAmountValue: finalAmounts.debit,
    intervalDebitAmountValue: newIntervalDebitAmountValue,
    grantTotalDebitAmountValue: newGrantTotalDebitAmountValue,
    paymentReceiveAmountValue: finalAmounts.receive,
    intervalReceiveAmountValue: newIntervalReceiveAmountValue,
    grantTotalReceiveAmountValue: newGrantTotalReceiveAmountValue,
    intervalStart: latestPaymentSpentAmounts.intervalStart,
    intervalEnd: latestPaymentSpentAmounts.intervalEnd,
    createdAt: new Date(),
    paymentState: payment.state
  })
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
    revertGrantSpentAmounts(deps, payment)
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
async function updateGrantSpentAmounts(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  finalAmounts: PayResult
) {
  if (!payment.grantId) return

  const latestPaymentSpentAmounts = await getLatestPaymentSpentAmounts(
    deps,
    payment.id
  )
  if (!latestPaymentSpentAmounts) return

  const reservedReceiveAmount =
    latestPaymentSpentAmounts.paymentReceiveAmountValue
  const receiveAmountDifference = reservedReceiveAmount - finalAmounts.receive

  if (receiveAmountDifference === 0n) return

  const records = await getRemainingGrantSpentAmounts(
    deps,
    payment.grantId,
    latestPaymentSpentAmounts
  )
  if (!records) return

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
    ...latestPaymentSpentAmounts,
    id: v4(),
    outgoingPaymentId: payment.id,
    paymentDebitAmountValue: finalAmounts.debit,
    intervalDebitAmountValue: newIntervalDebitAmountValue,
    grantTotalDebitAmountValue:
      latestGrantSpentAmounts.grantTotalDebitAmountValue,
    paymentReceiveAmountValue: finalAmounts.receive,
    intervalReceiveAmountValue: newIntervalReceiveAmountValue,
    grantTotalReceiveAmountValue: newGrantTotalReceiveAmountValue,
    intervalStart: latestPaymentSpentAmounts.intervalStart,
    intervalEnd: latestPaymentSpentAmounts.intervalEnd,
    createdAt: new Date(),
    paymentState: OutgoingPaymentState.Completed
  })
}

/**
 * Reverts the grant spent amounts when a payment fails.
 * Inserts a spent amount record with the reserved amounts adjusted out.
 */
async function revertGrantSpentAmounts(
  deps: ServiceDependencies,
  payment: OutgoingPayment
): Promise<void> {
  if (!payment.grantId) return

  const latestPaymentSpentAmounts = await getLatestPaymentSpentAmounts(
    deps,
    payment.id
  )
  if (!latestPaymentSpentAmounts) return

  const records = await getRemainingGrantSpentAmounts(
    deps,
    payment.grantId,
    latestPaymentSpentAmounts
  )
  if (!records) return

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
    ...latestPaymentSpentAmounts,
    id: v4(),
    outgoingPaymentId: payment.id,
    paymentDebitAmountValue: BigInt(0),
    intervalDebitAmountValue: newIntervalDebitAmountValue,
    grantTotalDebitAmountValue: newGrantTotalDebitAmountValue,
    paymentReceiveAmountValue: BigInt(0),
    intervalReceiveAmountValue: newIntervalReceiveAmountValue,
    grantTotalReceiveAmountValue: newGrantTotalReceiveAmountValue,
    createdAt: new Date(),
    paymentState: OutgoingPaymentState.Failed,
    intervalStart: latestPaymentSpentAmounts.intervalStart,
    intervalEnd: latestPaymentSpentAmounts.intervalEnd
  })
}
