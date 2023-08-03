import {
  ForeignKeyViolationError,
  TransactionOrKnex,
  NotFoundError
} from 'objection'
import { URL } from 'url'

import { PaymentPointerError } from './errors'
import {
  PaymentPointer,
  PaymentPointerEvent,
  PaymentPointerEventType,
  GetOptions,
  ListOptions,
  PaymentPointerSubresource
} from './model'
import { BaseService } from '../../shared/baseService'
import { AccountingService } from '../../accounting/service'
import {
  IncomingPayment,
  IncomingPaymentState
} from '../payment/incoming/model'
import { IAppConfig } from '../../config/app'
import { Pagination } from '../../shared/baseModel'
import { WebhookService } from '../../webhook/service'
import { poll } from '../../shared/utils'

interface Options {
  publicName?: string
}

export interface CreateOptions extends Options {
  url: string
  assetId: string
}

export interface UpdateOptions extends Options {
  id: string
  status?: 'ACTIVE' | 'INACTIVE'
}

type UpdateInput = Omit<UpdateOptions, 'id'> & { deactivatedAt?: Date | null }

export interface PaymentPointerService {
  create(options: CreateOptions): Promise<PaymentPointer | PaymentPointerError>
  update(options: UpdateOptions): Promise<PaymentPointer | PaymentPointerError>
  get(id: string): Promise<PaymentPointer | undefined>
  getByUrl(url: string): Promise<PaymentPointer | undefined>
  getOrPollByUrl(url: string): Promise<PaymentPointer | undefined>
  getPage(pagination?: Pagination): Promise<PaymentPointer[]>
  processNext(): Promise<string | undefined>
  triggerEvents(limit: number): Promise<number>
}

interface ServiceDependencies extends BaseService {
  config: IAppConfig
  knex: TransactionOrKnex
  accountingService: AccountingService
  webhookService: WebhookService
}

export async function createPaymentPointerService({
  logger,
  config,
  knex,
  accountingService,
  webhookService
}: ServiceDependencies): Promise<PaymentPointerService> {
  const log = logger.child({
    service: 'PaymentPointerService'
  })
  const deps: ServiceDependencies = {
    config,
    logger: log,
    knex,
    accountingService,
    webhookService
  }
  return {
    create: (options) => createPaymentPointer(deps, options),
    update: (options) => updatePaymentPointer(deps, options),
    get: (id) => getPaymentPointer(deps, id),
    getByUrl: (url) => getPaymentPointerByUrl(deps, url),
    getOrPollByUrl: (url) => getOrPollByUrl(deps, url),
    getPage: (pagination?) => getPaymentPointerPage(deps, pagination),
    processNext: () => processNextPaymentPointer(deps),
    triggerEvents: (limit) => triggerPaymentPointerEvents(deps, limit)
  }
}

export const FORBIDDEN_PATHS = [
  '/incoming-payments',
  '/outgoing-payments',
  '/quotes'
]

function isValidPaymentPointerUrl(paymentPointerUrl: string): boolean {
  try {
    const url = new URL(paymentPointerUrl)
    if (url.protocol !== 'https:' || url.pathname === '/') {
      return false
    }
    for (const path of FORBIDDEN_PATHS) {
      if (url.pathname.includes(path)) {
        return false
      }
    }
    return true
  } catch (_) {
    return false
  }
}

async function createPaymentPointer(
  deps: ServiceDependencies,
  options: CreateOptions
): Promise<PaymentPointer | PaymentPointerError> {
  if (!isValidPaymentPointerUrl(options.url)) {
    return PaymentPointerError.InvalidUrl
  }
  try {
    return await PaymentPointer.query(deps.knex)
      .insertAndFetch({
        url: options.url,
        publicName: options.publicName,
        assetId: options.assetId
      })
      .withGraphFetched('asset')
  } catch (err) {
    if (err instanceof ForeignKeyViolationError) {
      if (err.constraint === 'paymentpointers_assetid_foreign') {
        return PaymentPointerError.UnknownAsset
      }
    }
    throw err
  }
}

async function updatePaymentPointer(
  deps: ServiceDependencies,
  { id, status, publicName }: UpdateOptions
): Promise<PaymentPointer | PaymentPointerError> {
  try {
    const update: UpdateInput = { publicName }
    const paymentPointer = await PaymentPointer.query(deps.knex)
      .findById(id)
      .throwIfNotFound()

    if (status === 'INACTIVE' && paymentPointer.isActive) {
      update.deactivatedAt = new Date()
      await deactivateOpenIncomingPaymentsByPaymentPointer(deps, id)
    } else if (status === 'ACTIVE' && !paymentPointer.isActive) {
      update.deactivatedAt = null
    }

    return await paymentPointer
      .$query(deps.knex)
      .patchAndFetch(update)
      .withGraphFetched('asset')
      .throwIfNotFound()
  } catch (err) {
    if (err instanceof NotFoundError) {
      return PaymentPointerError.UnknownPaymentPointer
    }
    throw err
  }
}

async function getPaymentPointer(
  deps: ServiceDependencies,
  id: string
): Promise<PaymentPointer | undefined> {
  return await PaymentPointer.query(deps.knex)
    .findById(id)
    .withGraphFetched('asset')
}

async function getOrPollByUrl(
  deps: ServiceDependencies,
  url: string
): Promise<PaymentPointer | undefined> {
  const existingPaymentPointer = await getPaymentPointerByUrl(deps, url)

  if (existingPaymentPointer) {
    return existingPaymentPointer
  }

  await PaymentPointerEvent.query(deps.knex).insert({
    type: PaymentPointerEventType.PaymentPointerNotFound,
    data: {
      paymentPointerUrl: url
    }
  })

  try {
    const paymentPointer = await poll({
      request: () => getPaymentPointerByUrl(deps, url),
      pollingFrequencyMs: deps.config.paymentPointerPollingFrequencyMs,
      timeoutMs: deps.config.paymentPointerLookupTimeoutMs
    })

    return paymentPointer
  } catch (error) {
    const errorMessage = 'Could not get payment pointer'
    deps.logger.error(
      { errorMessage: error instanceof Error && error.message },
      errorMessage
    )

    return undefined
  }
}

async function getPaymentPointerByUrl(
  deps: ServiceDependencies,
  url: string
): Promise<PaymentPointer | undefined> {
  const paymentPointer = await PaymentPointer.query(deps.knex)
    .findOne({ url })
    .withGraphFetched('asset')
  return paymentPointer || undefined
}

async function getPaymentPointerPage(
  deps: ServiceDependencies,
  pagination?: Pagination
): Promise<PaymentPointer[]> {
  return await PaymentPointer.query(deps.knex)
    .getPage(pagination)
    .withGraphFetched('asset')
}

// Returns the id of the processed payment pointer (if any).
async function processNextPaymentPointer(
  deps: ServiceDependencies
): Promise<string | undefined> {
  const paymentPointers = await processNextPaymentPointers(deps, 1)
  return paymentPointers[0]?.id
}

async function triggerPaymentPointerEvents(
  deps: ServiceDependencies,
  limit: number
): Promise<number> {
  const paymentPointers = await processNextPaymentPointers(deps, limit)
  return paymentPointers.length
}

// Fetch (and lock) payment pointers for work.
// Returns the processed accounts (if any).
async function processNextPaymentPointers(
  deps_: ServiceDependencies,
  limit: number
): Promise<PaymentPointer[]> {
  return deps_.knex.transaction(async (trx) => {
    const now = new Date(Date.now()).toISOString()
    const paymentPointers = await PaymentPointer.query(trx)
      .limit(limit)
      // Ensure the payment pointers cannot be processed concurrently by multiple workers.
      .forUpdate()
      // If a payment pointer is locked, don't wait — just come back for it later.
      .skipLocked()
      .where('processAt', '<=', now)
      .withGraphFetched('asset')

    const deps = {
      ...deps_,
      knex: trx
    }

    for (const paymentPointer of paymentPointers) {
      deps.logger = deps_.logger.child({
        paymentPointer: paymentPointer.id
      })
      await createWithdrawalEvent(deps, paymentPointer)
      await paymentPointer.$query(deps.knex).patch({
        processAt: null
      })
    }

    return paymentPointers
  })
}

// "paymentPointer" must have been fetched with the "deps.knex" transaction.
async function createWithdrawalEvent(
  deps: ServiceDependencies,
  paymentPointer: PaymentPointer
): Promise<void> {
  const totalReceived = await deps.accountingService.getTotalReceived(
    paymentPointer.id
  )
  if (!totalReceived) {
    deps.logger.warn({ totalReceived }, 'missing/empty balance')
    return
  }

  const amount = totalReceived - paymentPointer.totalEventsAmount

  if (amount <= BigInt(0)) {
    deps.logger.warn(
      {
        totalReceived,
        totalEventsAmount: paymentPointer.totalEventsAmount
      },
      'no amount to withdrawal'
    )
    return
  }

  deps.logger.trace({ amount }, 'creating webhook withdrawal event')

  await PaymentPointerEvent.query(deps.knex).insert({
    type: PaymentPointerEventType.PaymentPointerWebMonetization,
    data: paymentPointer.toData(amount),
    withdrawal: {
      accountId: paymentPointer.id,
      assetId: paymentPointer.assetId,
      amount
    }
  })

  await paymentPointer.$query(deps.knex).patch({
    totalEventsAmount: paymentPointer.totalEventsAmount + amount
  })
}

async function deactivateOpenIncomingPaymentsByPaymentPointer(
  deps: ServiceDependencies,
  paymentPointerId: string
) {
  const expiresAt = new Date(
    Date.now() + deps.config.paymentPointerDeactivationPaymentGracePeriodMs
  )
  await IncomingPayment.query(deps.knex)
    .patch({ expiresAt })
    .where('paymentPointerId', paymentPointerId)
    .whereIn('state', [
      IncomingPaymentState.Pending,
      IncomingPaymentState.Processing
    ])
    .where('expiresAt', '>', expiresAt)
}

export interface CreateSubresourceOptions {
  paymentPointerId: string
}

export interface PaymentPointerSubresourceService<
  M extends PaymentPointerSubresource
> {
  get(options: GetOptions): Promise<M | undefined>
  create(options: { paymentPointerId: string }): Promise<M | string>
  getPaymentPointerPage(options: ListOptions): Promise<M[]>
}
