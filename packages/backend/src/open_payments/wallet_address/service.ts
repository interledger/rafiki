import {
  ForeignKeyViolationError,
  TransactionOrKnex,
  NotFoundError
} from 'objection'
import { URL } from 'url'

import { WalletAddressError } from './errors'
import {
  WalletAddress,
  WalletAddressEvent,
  WalletAddressEventType,
  GetOptions,
  ListOptions,
  WalletAddressSubresource
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

export interface WalletAddressService {
  create(options: CreateOptions): Promise<WalletAddress | WalletAddressError>
  update(options: UpdateOptions): Promise<WalletAddress | WalletAddressError>
  get(id: string): Promise<WalletAddress | undefined>
  getByUrl(url: string): Promise<WalletAddress | undefined>
  getOrPollByUrl(url: string): Promise<WalletAddress | undefined>
  getPage(pagination?: Pagination): Promise<WalletAddress[]>
  processNext(): Promise<string | undefined>
  triggerEvents(limit: number): Promise<number>
}

interface ServiceDependencies extends BaseService {
  config: IAppConfig
  knex: TransactionOrKnex
  accountingService: AccountingService
  webhookService: WebhookService
}

export async function createWalletAddressService({
  logger,
  config,
  knex,
  accountingService,
  webhookService
}: ServiceDependencies): Promise<WalletAddressService> {
  const log = logger.child({
    service: 'WalletAddressService'
  })
  const deps: ServiceDependencies = {
    config,
    logger: log,
    knex,
    accountingService,
    webhookService
  }
  return {
    create: (options) => createWalletAddress(deps, options),
    update: (options) => updateWalletAddress(deps, options),
    get: (id) => getWalletAddress(deps, id),
    getByUrl: (url) => getWalletAddressByUrl(deps, url),
    getOrPollByUrl: (url) => getOrPollByUrl(deps, url),
    getPage: (pagination?) => getWalletAddressPage(deps, pagination),
    processNext: () => processNextWalletAddress(deps),
    triggerEvents: (limit) => triggerWalletAddressEvents(deps, limit)
  }
}

export const FORBIDDEN_PATHS = [
  '/incoming-payments',
  '/outgoing-payments',
  '/quotes'
]

function isValidWalletAddressUrl(walletAddressUrl: string): boolean {
  try {
    const url = new URL(walletAddressUrl)
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

async function createWalletAddress(
  deps: ServiceDependencies,
  options: CreateOptions
): Promise<WalletAddress | WalletAddressError> {
  if (!isValidWalletAddressUrl(options.url)) {
    return WalletAddressError.InvalidUrl
  }
  try {
    return await WalletAddress.query(deps.knex)
      .insertAndFetch({
        url: options.url,
        publicName: options.publicName,
        assetId: options.assetId
      })
      .withGraphFetched('asset')
  } catch (err) {
    if (err instanceof ForeignKeyViolationError) {
      if (err.constraint === 'walletaddresses_assetid_foreign') {
        return WalletAddressError.UnknownAsset
      }
    }
    throw err
  }
}

async function updateWalletAddress(
  deps: ServiceDependencies,
  { id, status, publicName }: UpdateOptions
): Promise<WalletAddress | WalletAddressError> {
  try {
    const update: UpdateInput = { publicName }
    const walletAddress = await WalletAddress.query(deps.knex)
      .findById(id)
      .throwIfNotFound()

    if (status === 'INACTIVE' && walletAddress.isActive) {
      update.deactivatedAt = new Date()
      await deactivateOpenIncomingPaymentsByWalletAddress(deps, id)
    } else if (status === 'ACTIVE' && !walletAddress.isActive) {
      update.deactivatedAt = null
    }

    return await walletAddress
      .$query(deps.knex)
      .patchAndFetch(update)
      .withGraphFetched('asset')
      .throwIfNotFound()
  } catch (err) {
    if (err instanceof NotFoundError) {
      return WalletAddressError.UnknownWalletAddress
    }
    throw err
  }
}

async function getWalletAddress(
  deps: ServiceDependencies,
  id: string
): Promise<WalletAddress | undefined> {
  return await WalletAddress.query(deps.knex)
    .findById(id)
    .withGraphFetched('asset')
}

async function getOrPollByUrl(
  deps: ServiceDependencies,
  url: string
): Promise<WalletAddress | undefined> {
  const existingWalletAddress = await getWalletAddressByUrl(deps, url)

  if (existingWalletAddress) {
    return existingWalletAddress
  }

  await WalletAddressEvent.query(deps.knex).insert({
    type: WalletAddressEventType.WalletAddressNotFound,
    data: {
      walletAddressUrl: url
    }
  })

  try {
    const walletAddress = await poll({
      request: () => getWalletAddressByUrl(deps, url),
      pollingFrequencyMs: deps.config.walletAddressPollingFrequencyMs,
      timeoutMs: deps.config.walletAddressLookupTimeoutMs
    })

    return walletAddress
  } catch (error) {
    const errorMessage = 'Could not get wallet address'
    deps.logger.error(
      { errorMessage: error instanceof Error && error.message },
      errorMessage
    )

    return undefined
  }
}

async function getWalletAddressByUrl(
  deps: ServiceDependencies,
  url: string
): Promise<WalletAddress | undefined> {
  const walletAddress = await WalletAddress.query(deps.knex)
    .findOne({ url })
    .withGraphFetched('asset')
  return walletAddress || undefined
}

async function getWalletAddressPage(
  deps: ServiceDependencies,
  pagination?: Pagination
): Promise<WalletAddress[]> {
  return await WalletAddress.query(deps.knex)
    .getPage(pagination)
    .withGraphFetched('asset')
}

// Returns the id of the processed wallet address (if any).
async function processNextWalletAddress(
  deps: ServiceDependencies
): Promise<string | undefined> {
  const walletAddresses = await processNextWalletAddresses(deps, 1)
  return walletAddresses[0]?.id
}

async function triggerWalletAddressEvents(
  deps: ServiceDependencies,
  limit: number
): Promise<number> {
  const walletAddresses = await processNextWalletAddresses(deps, limit)
  return walletAddresses.length
}

// Fetch (and lock) wallet addresses for work.
// Returns the processed accounts (if any).
async function processNextWalletAddresses(
  deps_: ServiceDependencies,
  limit: number
): Promise<WalletAddress[]> {
  return deps_.knex.transaction(async (trx) => {
    const now = new Date(Date.now()).toISOString()
    const walletAddresses = await WalletAddress.query(trx)
      .limit(limit)
      // Ensure the wallet addresses cannot be processed concurrently by multiple workers.
      .forUpdate()
      // If a wallet address is locked, don't wait — just come back for it later.
      .skipLocked()
      .where('processAt', '<=', now)
      .withGraphFetched('asset')

    const deps = {
      ...deps_,
      knex: trx
    }

    for (const walletAddress of walletAddresses) {
      deps.logger = deps_.logger.child({
        walletAddress: walletAddress.id
      })
      await createWithdrawalEvent(deps, walletAddress)
      await walletAddress.$query(deps.knex).patch({
        processAt: null
      })
    }

    return walletAddresses
  })
}

// "walletAddress" must have been fetched with the "deps.knex" transaction.
async function createWithdrawalEvent(
  deps: ServiceDependencies,
  walletAddress: WalletAddress
): Promise<void> {
  const totalReceived = await deps.accountingService.getTotalReceived(
    walletAddress.id
  )
  if (!totalReceived) {
    deps.logger.warn({ totalReceived }, 'missing/empty balance')
    return
  }

  const amount = totalReceived - walletAddress.totalEventsAmount

  if (amount <= BigInt(0)) {
    deps.logger.warn(
      {
        totalReceived,
        totalEventsAmount: walletAddress.totalEventsAmount
      },
      'no amount to withdrawal'
    )
    return
  }

  deps.logger.trace({ amount }, 'creating webhook withdrawal event')

  await WalletAddressEvent.query(deps.knex).insert({
    type: WalletAddressEventType.WalletAddressWebMonetization,
    data: walletAddress.toData(amount),
    withdrawal: {
      accountId: walletAddress.id,
      assetId: walletAddress.assetId,
      amount
    }
  })

  await walletAddress.$query(deps.knex).patch({
    totalEventsAmount: walletAddress.totalEventsAmount + amount
  })
}

async function deactivateOpenIncomingPaymentsByWalletAddress(
  deps: ServiceDependencies,
  walletAddressId: string
) {
  const expiresAt = new Date(
    Date.now() + deps.config.walletAddressDeactivationPaymentGracePeriodMs
  )
  await IncomingPayment.query(deps.knex)
    .patch({ expiresAt })
    .where('walletAddressId', walletAddressId)
    .whereIn('state', [
      IncomingPaymentState.Pending,
      IncomingPaymentState.Processing
    ])
    .where('expiresAt', '>', expiresAt)
}

export interface CreateSubresourceOptions {
  walletAddressId: string
}

export interface WalletAddressSubresourceService<
  M extends WalletAddressSubresource
> {
  get(options: GetOptions): Promise<M | undefined>
  create(options: { walletAddressId: string }): Promise<M | string>
  getWalletAddressPage(options: ListOptions): Promise<M[]>
}
