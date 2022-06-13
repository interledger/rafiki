import {
  IncomingPayment,
  IncomingPaymentEvent,
  IncomingPaymentEventType,
  IncomingPaymentState
} from './model'
import { AccountingService } from '../../../accounting/service'
import { Pagination } from '../../../shared/baseModel'
import { BaseService } from '../../../shared/baseService'
import assert from 'assert'
import { Transaction } from 'knex'
import { TransactionOrKnex } from 'objection'
import { AccountService } from '../../account/service'
import { Amount } from '../../amount'
import { IncomingPaymentError } from './errors'
import { parse, end } from 'iso8601-duration'

export const POSITIVE_SLIPPAGE = BigInt(1)
// First retry waits 10 seconds
// Second retry waits 20 (more) seconds
// Third retry waits 30 (more) seconds, etc. up to 60 seconds
export const RETRY_BACKOFF_MS = 10_000
// TODO: make expiry date configurable
export const EXPIRY = parse('P90D') // 90 days in future

export interface CreateIncomingPaymentOptions {
  accountId: string
  description?: string
  expiresAt?: Date
  incomingAmount?: Amount
  externalRef?: string
}

export interface IncomingPaymentService {
  get(id: string): Promise<IncomingPayment | undefined>
  create(
    options: CreateIncomingPaymentOptions,
    trx?: Transaction
  ): Promise<IncomingPayment | IncomingPaymentError>
  complete(id: string): Promise<IncomingPayment | IncomingPaymentError>
  getAccountPage(
    accountId: string,
    pagination?: Pagination
  ): Promise<IncomingPayment[]>
  processNext(): Promise<string | undefined>
}

export interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  accountingService: AccountingService
  accountService: AccountService
}

export async function createIncomingPaymentService(
  deps_: ServiceDependencies
): Promise<IncomingPaymentService> {
  const log = deps_.logger.child({
    service: 'IncomingPaymentService'
  })
  const deps: ServiceDependencies = {
    ...deps_,
    logger: log
  }
  return {
    get: (id) => getIncomingPayment(deps, id),
    create: (options, trx) => createIncomingPayment(deps, options, trx),
    complete: (id) => completeIncomingPayment(deps, id),
    getAccountPage: (accountId, pagination) =>
      getAccountPage(deps, accountId, pagination),
    processNext: () => processNextIncomingPayment(deps)
  }
}

async function getIncomingPayment(
  deps: ServiceDependencies,
  id: string
): Promise<IncomingPayment | undefined> {
  const incomingPayment = await IncomingPayment.query(deps.knex)
    .findById(id)
    .withGraphFetched('asset')
  if (incomingPayment) return await addReceivedAmount(deps, incomingPayment)
  else return
}

async function createIncomingPayment(
  deps: ServiceDependencies,
  {
    accountId,
    description,
    expiresAt,
    incomingAmount,
    externalRef
  }: CreateIncomingPaymentOptions,
  trx?: Transaction
): Promise<IncomingPayment | IncomingPaymentError> {
  if (!expiresAt) {
    expiresAt = end(EXPIRY)
  } else if (expiresAt.getTime() <= Date.now()) {
    return IncomingPaymentError.InvalidExpiry
  }
  const account = await deps.accountService.get(accountId)
  if (!account) {
    return IncomingPaymentError.UnknownAccount
  }
  if (incomingAmount) {
    if (incomingAmount.value <= 0) {
      return IncomingPaymentError.InvalidAmount
    }
    if (incomingAmount.assetCode || incomingAmount.assetScale) {
      if (
        incomingAmount.assetCode !== account.asset.code ||
        incomingAmount.assetScale !== account.asset.scale
      ) {
        return IncomingPaymentError.InvalidAmount
      }
    }
  }
  const invTrx = trx || (await IncomingPayment.startTransaction(deps.knex))
  try {
    const incomingPayment = await IncomingPayment.query(invTrx)
      .insertAndFetch({
        accountId,
        assetId: account.asset.id,
        description,
        expiresAt,
        incomingAmount,
        externalRef,
        state: IncomingPaymentState.Pending,
        processAt: expiresAt
      })
      .withGraphFetched('asset')

    // Incoming payment accounts are credited by the amounts received by the incoming payment.
    // Credits are restricted such that the incoming payments cannot receive more than that amount.
    await deps.accountingService.createLiquidityAccount(incomingPayment)

    if (!trx) {
      await invTrx.commit()
    }
    return await addReceivedAmount(deps, incomingPayment, BigInt(0))
  } catch (err) {
    if (!trx) {
      await invTrx.rollback()
    }
    throw err
  }
}

// Fetch (and lock) an incoming payment for work.
// Returns the id of the processed incoming payment (if any).
async function processNextIncomingPayment(
  deps_: ServiceDependencies
): Promise<string | undefined> {
  return deps_.knex.transaction(async (trx) => {
    const now = new Date(Date.now()).toISOString()
    const incomingPayments = await IncomingPayment.query(trx)
      .limit(1)
      // Ensure the incoming payments cannot be processed concurrently by multiple workers.
      .forUpdate()
      // If an incoming payment is locked, don't wait — just come back for it later.
      .skipLocked()
      .where('processAt', '<=', now)
      .withGraphFetched('asset')

    const incomingPayment = incomingPayments[0]
    if (!incomingPayment) return

    const deps = {
      ...deps_,
      knex: trx,
      logger: deps_.logger.child({
        incomingPayment: incomingPayment.id
      })
    }
    if (
      incomingPayment.state === IncomingPaymentState.Expired ||
      incomingPayment.state === IncomingPaymentState.Completed
    ) {
      await handleDeactivated(deps, incomingPayment)
    } else {
      await handleExpired(deps, incomingPayment)
    }
    return incomingPayment.id
  })
}

// Deactivate expired incoming payments that have some money.
// Delete expired incoming payments that have never received money.
async function handleExpired(
  deps: ServiceDependencies,
  incomingPayment: IncomingPayment
): Promise<void> {
  const amountReceived = await deps.accountingService.getTotalReceived(
    incomingPayment.id
  )
  if (amountReceived) {
    deps.logger.trace(
      { amountReceived },
      'deactivating expired incoming payment'
    )
    await incomingPayment.$query(deps.knex).patch({
      state: IncomingPaymentState.Expired,
      // Add 30 seconds to allow a prepared (but not yet fulfilled/rejected) packet to finish before sending webhook event.
      processAt: new Date(Date.now() + 30_000)
    })
  } else {
    deps.logger.debug({ amountReceived }, 'deleting expired incoming payment')
    await incomingPayment.$query(deps.knex).delete()
  }
}

// Create webhook event to withdraw deactivated incoming payments' liquidity.
async function handleDeactivated(
  deps: ServiceDependencies,
  incomingPayment: IncomingPayment
): Promise<void> {
  assert.ok(incomingPayment.processAt)
  try {
    const amountReceived = await deps.accountingService.getTotalReceived(
      incomingPayment.id
    )
    if (!amountReceived) {
      deps.logger.warn(
        { amountReceived },
        'deactivated incoming payment and empty balance'
      )
      await incomingPayment.$query(deps.knex).patch({ processAt: null })
      return
    }

    const type =
      incomingPayment.state == IncomingPaymentState.Expired
        ? IncomingPaymentEventType.IncomingPaymentExpired
        : IncomingPaymentEventType.IncomingPaymentCompleted
    deps.logger.trace({ type }, 'creating incoming payment webhook event')

    await IncomingPaymentEvent.query(deps.knex).insertAndFetch({
      type,
      data: incomingPayment.toData(amountReceived),
      withdrawal: {
        accountId: incomingPayment.id,
        assetId: incomingPayment.assetId,
        amount: amountReceived
      }
    })

    await incomingPayment.$query(deps.knex).patch({
      processAt: null
    })
  } catch (error) {
    deps.logger.warn({ error }, 'webhook event creation failed; retrying')
  }
}

async function getAccountPage(
  deps: ServiceDependencies,
  accountId: string,
  pagination?: Pagination
): Promise<IncomingPayment[]> {
  const page = await IncomingPayment.query(deps.knex)
    .getPage(pagination)
    .where({
      accountId
    })
    .withGraphFetched('asset')

  const amounts = await deps.accountingService.getAccountsTotalReceived(
    page.map((payment: IncomingPayment) => payment.id)
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  return page.map((payment: IncomingPayment, i: number) => {
    try {
      payment.receivedAmount = {
        value: BigInt(amounts[i]),
        assetCode: payment.asset.code,
        assetScale: payment.asset.scale
      }
    } catch (_) {
      deps.logger.error({ payment: payment.id }, 'account not found')
      throw new Error(
        `Underlying TB account not found, payment id: ${payment.id}`
      )
    }
    return payment
  })
}

async function completeIncomingPayment(
  deps: ServiceDependencies,
  id: string
): Promise<IncomingPayment | IncomingPaymentError> {
  return deps.knex.transaction(async (trx) => {
    const payment = await IncomingPayment.query(trx)
      .findById(id)
      .forUpdate()
      .withGraphFetched('asset')
    if (!payment) return IncomingPaymentError.UnknownPayment
    if (
      ![IncomingPaymentState.Pending, IncomingPaymentState.Processing].includes(
        payment.state
      )
    ) {
      return IncomingPaymentError.WrongState
    }
    await payment.$query(trx).patch({
      state: IncomingPaymentState.Completed,
      processAt: new Date(Date.now() + 30_000)
    })
    return await addReceivedAmount(deps, payment)
  })
}

async function addReceivedAmount(
  deps: ServiceDependencies,
  payment: IncomingPayment,
  value?: bigint
): Promise<IncomingPayment> {
  const received =
    value || (await deps.accountingService.getTotalReceived(payment.id))
  if (received !== undefined) {
    payment.receivedAmount = {
      value: received,
      assetCode: payment.asset.code,
      assetScale: payment.asset.scale
    }
  } else {
    deps.logger.error({ incomingPayment: payment.id }, 'account not found')
    throw new Error(
      `Underlying TB account not found, payment id: ${payment.id}`
    )
  }
  return payment
}
