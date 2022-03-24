import {
  Amount,
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
import { PartialModelObject, TransactionOrKnex } from 'objection'
import { AccountService } from '../../account/service'
import { IncomingPaymentError } from './errors'

export const POSITIVE_SLIPPAGE = BigInt(1)
// First retry waits 10 seconds
// Second retry waits 20 (more) seconds
// Third retry waits 30 (more) seconds, etc. up to 60 seconds
export const RETRY_BACKOFF_MS = 10_000
// TODO: make expiry date configurable
export const EXPIRY = new Date(new Date().setDate(90)) // 90 days in future

export interface CreateIncomingPaymentOptions {
  accountId: string
  description?: string
  expiresAt?: Date
  incomingAmount?: Amount
  externalRef?: string
  receiptsEnabled: boolean
}

interface UpdateIncomingPaymentOptions {
  id: string
  state: IncomingPaymentState
}

export interface IncomingPaymentService {
  get(id: string): Promise<IncomingPayment | undefined>
  create(
    options: CreateIncomingPaymentOptions,
    trx?: Transaction
  ): Promise<IncomingPayment | IncomingPaymentError>
  update(
    options: UpdateIncomingPaymentOptions
  ): Promise<IncomingPayment | IncomingPaymentError>
  getAccountIncomingPaymentsPage(
    accountId: string,
    pagination?: Pagination
  ): Promise<IncomingPayment[]>
  processNext(): Promise<string | undefined>
}

interface ServiceDependencies extends BaseService {
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
    update: (options) => updateIncomingPayment(deps, options),
    getAccountIncomingPaymentsPage: (accountId, pagination) =>
      getAccountIncomingPaymentsPage(deps, accountId, pagination),
    processNext: () => processNextIncomingPayment(deps)
  }
}

async function getIncomingPayment(
  deps: ServiceDependencies,
  id: string
): Promise<IncomingPayment | undefined> {
  return IncomingPayment.query(deps.knex)
    .findById(id)
    .withGraphJoined('account.asset')
}

async function createIncomingPayment(
  deps: ServiceDependencies,
  {
    accountId,
    description,
    expiresAt,
    incomingAmount,
    externalRef,
    receiptsEnabled
  }: CreateIncomingPaymentOptions,
  trx?: Transaction
): Promise<IncomingPayment | IncomingPaymentError> {
  const account = await deps.accountService.get(accountId)
  if (!account) {
    return IncomingPaymentError.UnknownAccount
  }
  if (incomingAmount) {
    if (incomingAmount.assetCode || incomingAmount.assetScale) {
      if (
        incomingAmount.assetCode !== account.asset.code ||
        incomingAmount.assetScale !== account.asset.scale
      ) {
        return IncomingPaymentError.InvalidAmount
      }
    }
    ;(incomingAmount.assetCode = account.asset.code),
      (incomingAmount.assetScale = account.asset.scale)
  }
  const invTrx = trx || (await IncomingPayment.startTransaction(deps.knex))
  try {
    const incomingPayment = await IncomingPayment.query(invTrx)
      .insertAndFetch({
        accountId,
        description,
        expiresAt: expiresAt || EXPIRY,
        incomingAmount,
        active: true,
        externalRef,
        state: IncomingPaymentState.Pending,
        receiptsEnabled,
        processAt: expiresAt
          ? new Date(expiresAt.getTime())
          : new Date(EXPIRY.getTime())
      })
      .withGraphFetched('account.asset')

    // Incoming payment accounts are credited by the amounts received by the incoming payment.
    // Credits are restricted such that the incoming payments cannot receive more than that amount.
    await deps.accountingService.createLiquidityAccount(incomingPayment)

    if (!trx) {
      await invTrx.commit()
    }
    return incomingPayment
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
      .withGraphFetched('account.asset')

    const incomingPayment = incomingPayments[0]
    if (!incomingPayment) return

    const deps = {
      ...deps_,
      knex: trx,
      logger: deps_.logger.child({
        incomingPayment: incomingPayment.id
      })
    }
    if (!incomingPayment.active) {
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
      active: false,
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
        : IncomingPaymentEventType.IncomingPaymentPaid
    deps.logger.trace({ type }, 'creating incoming payment webhook event')

    await IncomingPaymentEvent.query(deps.knex).insertAndFetch({
      type,
      data: incomingPayment.toData(amountReceived),
      withdrawal: {
        accountId: incomingPayment.id,
        assetId: incomingPayment.account.assetId,
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

async function getAccountIncomingPaymentsPage(
  deps: ServiceDependencies,
  accountId: string,
  pagination?: Pagination
): Promise<IncomingPayment[]> {
  assert.ok(deps.knex, 'Knex undefined')

  return await IncomingPayment.query(deps.knex).getPage(pagination).where({
    accountId: accountId
  })
}

async function updateIncomingPayment(
  deps: ServiceDependencies,
  { id, state }: UpdateIncomingPaymentOptions
): Promise<IncomingPayment | IncomingPaymentError> {
  return deps.knex.transaction(async (trx) => {
    const payment = await IncomingPayment.query(trx)
      .findById(id)
      .forUpdate()
      .withGraphFetched('account.asset')
    if (!payment) return IncomingPaymentError.UnknownPayment
    const update: PartialModelObject<IncomingPayment> = {}
    if (state === IncomingPaymentState.Completed) {
      switch (payment.state) {
        case IncomingPaymentState.Pending:
        case IncomingPaymentState.Processing:
          update.state = state
          update.active = false
          break
        default:
          return IncomingPaymentError.WrongState
      }
    } else {
      return IncomingPaymentError.InvalidState
    }
    update.processAt = new Date(Date.now() + 30_000)
    await payment.$query(trx).patch(update)
    return payment
  })
}
