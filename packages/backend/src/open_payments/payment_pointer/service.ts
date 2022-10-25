import { TransactionOrKnex } from 'objection'
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
import { AssetService, AssetOptions } from '../../asset/service'

export interface CreateOptions {
  url: string
  asset: AssetOptions
  publicName?: string
}

export interface PaymentPointerService {
  create(options: CreateOptions): Promise<PaymentPointer | PaymentPointerError>
  get(id: string): Promise<PaymentPointer | undefined>
  getByUrl(url: string): Promise<PaymentPointer | undefined>
  processNext(): Promise<string | undefined>
  triggerEvents(limit: number): Promise<number>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  accountingService: AccountingService
  assetService: AssetService
}

export async function createPaymentPointerService({
  logger,
  knex,
  accountingService,
  assetService
}: ServiceDependencies): Promise<PaymentPointerService> {
  const log = logger.child({
    service: 'PaymentPointerService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex,
    accountingService,
    assetService
  }
  return {
    create: (options) => createPaymentPointer(deps, options),
    get: (id) => getPaymentPointer(deps, id),
    getByUrl: (url) => getPaymentPointerByUrl(deps, url),
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
  const asset = await deps.assetService.getOrCreate(options.asset)
  return await PaymentPointer.query(deps.knex)
    .insertAndFetch({
      url: options.url,
      publicName: options.publicName,
      assetId: asset.id
    })
    .withGraphFetched('asset')
}

async function getPaymentPointer(
  deps: ServiceDependencies,
  id: string
): Promise<PaymentPointer | undefined> {
  return await PaymentPointer.query(deps.knex)
    .findById(id)
    .withGraphJoined('asset')
}

async function getPaymentPointerByUrl(
  deps: ServiceDependencies,
  url: string
): Promise<PaymentPointer | undefined> {
  const paymentPointer = await PaymentPointer.query(deps.knex)
    .findOne({ url })
    .withGraphJoined('asset')
  return paymentPointer || undefined
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
