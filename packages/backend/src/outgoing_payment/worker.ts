import * as knex from 'knex'
import { ServiceDependencies } from './service'
import { OutgoingPayment, PaymentState } from './model'
import * as lifecycle from './lifecycle'
import { IlpPlugin } from './ilp_plugin'
import { AssetAccount, Balance } from '../accounting/service'

// First retry waits 10 seconds, second retry waits 20 (more) seconds, etc.
export const RETRY_BACKOFF_SECONDS = 10

const maxStateAttempts: { [key in PaymentState]: number } = {
  Inactive: 5, // quoting
  Ready: Infinity, // autoapprove
  Funding: Infinity, // reserve funds
  Sending: 5, // send money
  Cancelled: Infinity,
  Completed: Infinity
}

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
    .where((builder: knex.QueryBuilder) => {
      builder
        .whereIn('state', [
          PaymentState.Inactive,
          PaymentState.Funding,
          PaymentState.Sending
        ])
        .orWhere('withdrawLiquidity', true)
    })
    // Back off between retries.
    .andWhere((builder: knex.QueryBuilder) => {
      builder
        .where('stateAttempts', 0)
        .orWhereRaw(
          '"updatedAt" + LEAST("stateAttempts", 6) * ? * interval \'1 seconds\' < ?',
          [RETRY_BACKOFF_SECONDS, now]
        )
    })
    .orWhere((builder: knex.QueryBuilder) => {
      builder
        .where('state', PaymentState.Ready)
        .andWhere((builder: knex.QueryBuilder) => {
          builder
            .where('intentAutoApprove', true)
            .orWhere('quoteActivationDeadline', '<', now)
        })
    })
    .withGraphFetched('paymentPointer.asset')
  return payments[0]
}

// Exported for testing.
export async function handlePaymentLifecycle(
  deps: ServiceDependencies,
  payment: OutgoingPayment
): Promise<void> {
  const onError = async (
    err: Error | lifecycle.PaymentError
  ): Promise<void> => {
    const error = typeof err === 'string' ? err : err.message
    const stateAttempts = payment.stateAttempts + 1

    if (
      payment.state === PaymentState.Cancelled ||
      payment.state === PaymentState.Completed ||
      (stateAttempts < maxStateAttempts[payment.state] &&
        lifecycle.canRetryError(err))
    ) {
      deps.logger.warn(
        { state: payment.state, error, stateAttempts },
        'payment lifecycle failed; retrying'
      )
      await payment.$query(deps.knex).patch({ stateAttempts })
    } else {
      // Too many attempts or non-retryable error; cancel payment.
      deps.logger.warn(
        { state: payment.state, error, stateAttempts },
        'payment lifecycle failed; cancelling'
      )
      await payment.$query(deps.knex).patch({
        state: PaymentState.Cancelled,
        withdrawLiquidity: true,
        error
      })
    }
  }

  // Plugins are cleaned up in `finally` to avoid leaking http2 connections.
  let plugin: IlpPlugin
  switch (payment.state) {
    case PaymentState.Inactive:
      // Use asset's sentAccount debit balance to not be limited by liquidity when sending rate probe packets
      plugin = deps.makeIlpPlugin({
        asset: {
          ...payment.paymentPointer.asset,
          account: AssetAccount.Sent
        }
      })
      return plugin
        .connect()
        .then(() => lifecycle.handleQuoting(deps, payment, plugin))
        .catch(onError)
        .finally(() => {
          return plugin.disconnect().catch((err: Error) => {
            deps.logger.warn(
              { error: err.message },
              'error disconnecting plugin'
            )
          })
        })
    case PaymentState.Ready:
      return lifecycle.handleReady(deps, payment).catch(onError)
    case PaymentState.Funding:
      return lifecycle.handleFunding(deps, payment).catch(onError)
    case PaymentState.Sending:
      plugin = deps.makeIlpPlugin({
        id: payment.id,
        asset: payment.paymentPointer.asset,
        withBalance: Balance.TotalSent
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
      if (payment.withdrawLiquidity) {
        return lifecycle.handleLiquidityWithdrawal(deps, payment).catch(onError)
      }
      deps.logger.warn('unexpected payment in lifecycle')
      break
  }
}
