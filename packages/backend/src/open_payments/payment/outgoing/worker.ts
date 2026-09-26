import { Knex } from 'knex'

import { ServiceDependencies } from './service'
import { OutgoingPayment, OutgoingPaymentState } from './model'
import { LifecycleError, PaymentError } from './errors'
import * as lifecycle from './lifecycle'
import { PaymentMethodHandlerError } from '../../../payment-method/handler/errors'
import { trace, Span } from '@opentelemetry/api'

// First retry waits 10 seconds, second retry waits 20 (more) seconds, etc.
export const RETRY_BACKOFF_SECONDS = 10

// Returns the id of the processed payment (if any).
export async function processPendingPayments(
  deps_: ServiceDependencies
): Promise<string[] | undefined> {
  const tracer = trace.getTracer('outgoing_payment_worker')

  return tracer.startActiveSpan(
    'outgoingPaymentLifecycle',
    async (span: Span) => {
      const stopTimer = deps_.telemetry.startTimer(
        'process_pending_payment_ms',
        {
          callName: 'OutgoingPaymentWorker:processPendingPayment'
        }
      )
      const paymentIds = await deps_.knex.transaction(async (trx) => {
        const payments = await getPendingPayments(trx, deps_)
        if (payments.length === 0) return

        const promises = payments.map((payment) =>
          handlePaymentLifecycle(
            {
              ...deps_,
              knex: trx,
              logger: deps_.logger.child({
                payment: payment.id,
                from_state: payment.state
              })
            },
            payment
          )
        )
        await Promise.all(promises)
        return payments.map((payment) => payment.id)
      })

      stopTimer()
      span.end()
      return paymentIds
    }
  )
}

// Fetch (and lock) a payment for work.
async function getPendingPayments(
  trx: Knex.Transaction,
  deps: ServiceDependencies
): Promise<OutgoingPayment[]> {
  const stopTimer = deps.telemetry.startTimer('get_pending_payment_ms', {
    callName: 'OutoingPaymentWorker:getPendingPayment'
  })
  const now = new Date(Date.now()).toISOString()
  const payments = await OutgoingPayment.query(trx)
    .limit(deps.config.outgoingPaymentBatchSize)
    // Ensure the payment cannot be processed concurrently by multiple workers.
    .forUpdate()
    // Don't wait for a payment that is already being processed.
    .skipLocked()
    .whereIn('state', [OutgoingPaymentState.Sending])
    // Back off between retries.
    .andWhere((builder: Knex.QueryBuilder) => {
      builder
        .where('stateAttempts', 0)
        .orWhereRaw(
          '"updatedAt" + LEAST("stateAttempts", 6) * ? * interval \'1 seconds\' < ?',
          [RETRY_BACKOFF_SECONDS, now]
        )
    })
    .withGraphFetched('quote')
  stopTimer()
  return payments
}

async function handlePaymentLifecycle(
  deps: ServiceDependencies,
  payment: OutgoingPayment
): Promise<void> {
  if (payment.state !== OutgoingPaymentState.Sending) {
    deps.logger.warn('unexpected payment in lifecycle')
    return
  }

  const [paymentWalletAddress, quoteAsset] = await Promise.all([
    deps.walletAddressService.get(payment.walletAddressId),
    deps.assetService.get(payment.quote.assetId)
  ])

  payment.walletAddress = paymentWalletAddress
  if (quoteAsset) {
    payment.quote.asset = quoteAsset
  }

  const stopTimer = deps.telemetry.startTimer('handle_sending_ms', {
    callName: 'OutoingPaymentWorker:handleSending'
  })
  try {
    await lifecycle.handleSending(deps, payment)
  } catch (error) {
    await onLifecycleError(deps, payment, error as Error | PaymentError)
  } finally {
    stopTimer()
  }
}

async function onLifecycleError(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  err: Error | PaymentError
): Promise<void> {
  let error: string
  if (err instanceof PaymentMethodHandlerError) {
    error = err.description || err.message
  } else if (typeof err === 'string') {
    error = err
  } else {
    error = err.message
  }
  const stateAttempts = payment.stateAttempts + 1

  const errorDescription =
    err instanceof PaymentMethodHandlerError ? err.description : undefined

  const errLog = {
    state: payment.state,
    error,
    stateAttempts,
    errorDescription
  }

  if (
    stateAttempts < deps.config.maxOutgoingPaymentRetryAttempts &&
    isRetryableError(err)
  ) {
    deps.logger.warn(errLog, 'payment lifecycle failed; retrying')
    await payment.$query(deps.knex).patch({ stateAttempts })
  } else {
    // Too many attempts or non-retryable error; fail payment.
    deps.logger.warn(errLog, 'payment lifecycle failed')
    await lifecycle.handleFailed(deps, payment, error)
  }
}

function isRetryableError(error: Error | PaymentError): boolean {
  if (error instanceof PaymentMethodHandlerError) {
    return !!error.retryable
  }

  if (error instanceof Error) {
    return true
  }

  if (error === LifecycleError.RatesUnavailable) {
    return true
  }

  return false
}
