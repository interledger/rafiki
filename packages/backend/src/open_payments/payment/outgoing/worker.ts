import * as knex from 'knex'

import { ServiceDependencies } from './service'
import { OutgoingPayment, OutgoingPaymentState } from './model'
import { canRetryError, PaymentError } from './errors'
import * as lifecycle from './lifecycle'
import { IlpPlugin } from '../../../shared/ilp_plugin'

// First retry waits 10 seconds, second retry waits 20 (more) seconds, etc.
export const RETRY_BACKOFF_SECONDS = 10

const MAX_STATE_ATTEMPTS = 5

// Returns the id of the processed payment (if any).
export async function processPendingPayment(
  deps_: ServiceDependencies
): Promise<string | undefined> {
  return deps_.knex.transaction(async (trx) => {
    const payment = await getPendingPayment(trx)
    if (!payment) return

    await handlePaymentLifecycle(
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
    return payment.id
  })
}

// Fetch (and lock) a payment for work.
// Exported for testing.
export async function getPendingPayment(
  trx: knex.Transaction
): Promise<OutgoingPayment | undefined> {
  const now = new Date(Date.now()).toISOString()
  const payments = await OutgoingPayment.query(trx)
    .limit(1)
    // Ensure the payment cannot be processed concurrently by multiple workers.
    .forUpdate()
    // Don't wait for a payment that is already being processed.
    .skipLocked()
    .whereIn('state', [OutgoingPaymentState.Sending])
    // Back off between retries.
    .andWhere((builder: knex.QueryBuilder) => {
      builder
        .where('stateAttempts', 0)
        .orWhereRaw(
          '"updatedAt" + LEAST("stateAttempts", 6) * ? * interval \'1 seconds\' < ?',
          [RETRY_BACKOFF_SECONDS, now]
        )
    })
    .withGraphFetched('[account, quote.asset]')
  return payments[0]
}

// Exported for testing.
export async function handlePaymentLifecycle(
  deps: ServiceDependencies,
  payment: OutgoingPayment
): Promise<void> {
  const onError = async (err: Error | PaymentError): Promise<void> => {
    const error = typeof err === 'string' ? err : err.message
    const stateAttempts = payment.stateAttempts + 1

    if (stateAttempts < MAX_STATE_ATTEMPTS && canRetryError(err)) {
      deps.logger.warn(
        { state: payment.state, error, stateAttempts },
        'payment lifecycle failed; retrying'
      )
      await payment.$query(deps.knex).patch({ stateAttempts })
    } else {
      // Too many attempts or non-retryable error; fail payment.
      deps.logger.warn(
        { state: payment.state, error, stateAttempts },
        'payment lifecycle failed'
      )
      await lifecycle.handleFailed(deps, payment, error)
    }
  }

  // Plugins are cleaned up in `finally` to avoid leaking http2 connections.
  let plugin: IlpPlugin
  switch (payment.state) {
    case OutgoingPaymentState.Sending:
      plugin = deps.makeIlpPlugin({
        sourceAccount: payment
      })
      return plugin
        .connect()
        .then(() => lifecycle.handleSending(deps, payment, plugin))
        .catch(onError)
        .finally(() => {
          return plugin.disconnect().catch((err: Error) => {
            deps.logger.warn(
              { error: err.message },
              'error disconnecting plugin'
            )
          })
        })
    default:
      deps.logger.warn('unexpected payment in lifecycle')
      break
  }
}
