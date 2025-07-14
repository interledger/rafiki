import {
  ForeignKeyViolationError,
  TransactionOrKnex,
  NotFoundError,
  UniqueViolationError
} from 'objection'
import { URL } from 'url'

import { isWalletAddressError, WalletAddressError } from './errors'
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
import { Pagination, SortOrder } from '../../shared/baseModel'
import {
  finalizeWebhookRecipients,
  WebhookService
} from '../../webhook/service'
import { poll } from '../../shared/utils'
import { WalletAddressAdditionalProperty } from './additional_property/model'
import { AssetService } from '../../asset/service'
import { CacheDataStore } from '../../middleware/cache/data-stores'
import { TenantSettingKeys } from '../../tenants/settings/model'
import { TenantSettingService } from '../../tenants/settings/service'

interface Options {
  publicName?: string
}

export type WalletAddressAdditionalPropertyInput = Pick<
  WalletAddressAdditionalProperty,
  'fieldKey' | 'fieldValue' | 'visibleInOpenPayments'
>

export interface CreateOptions extends Options {
  tenantId: string
  address: string
  assetId: string
  additionalProperties?: WalletAddressAdditionalPropertyInput[]
  isOperator?: boolean
}

type Status = 'ACTIVE' | 'INACTIVE'

export interface UpdateOptions extends Options {
  id: string
  status?: Status
  additionalProperties?: WalletAddressAdditionalPropertyInput[]
}

type UpdateInput = Options & {
  deactivatedAt?: Date | null
  status?: Status
}

export interface WalletAddressService {
  create(options: CreateOptions): Promise<WalletAddress | WalletAddressError>
  update(options: UpdateOptions): Promise<WalletAddress | WalletAddressError>
  getAdditionalProperties(
    id: string,
    includeVisibleOnlyAddProps: boolean
  ): Promise<WalletAddressAdditionalProperty[] | undefined>
  get(id: string, tenantId?: string): Promise<WalletAddress | undefined>
  getByUrl(url: string, tenantId?: string): Promise<WalletAddress | undefined>
  getOrPollByUrl(url: string): Promise<WalletAddress | undefined>
  getPage(
    pagination?: Pagination,
    sortOrder?: SortOrder,
    tenantId?: string
  ): Promise<WalletAddress[]>
  processNext(): Promise<string | undefined>
  triggerEvents(limit: number): Promise<number>
}

interface ServiceDependencies extends BaseService {
  config: IAppConfig
  knex: TransactionOrKnex
  accountingService: AccountingService
  webhookService: WebhookService
  assetService: AssetService
  walletAddressCache: CacheDataStore<WalletAddress>
  tenantSettingService: TenantSettingService
}

export async function createWalletAddressService({
  logger,
  config,
  knex,
  accountingService,
  webhookService,
  assetService,
  walletAddressCache,
  tenantSettingService
}: ServiceDependencies): Promise<WalletAddressService> {
  const log = logger.child({
    service: 'WalletAddressService'
  })
  const deps: ServiceDependencies = {
    config,
    logger: log,
    knex,
    accountingService,
    webhookService,
    assetService,
    walletAddressCache,
    tenantSettingService
  }
  return {
    create: (options) => createWalletAddress(deps, options),
    update: (options) => updateWalletAddress(deps, options),
    getAdditionalProperties: (walletAddressId, includeVisibleOnlyAddProps) =>
      getWalletAdditionalProperties(
        deps,
        walletAddressId,
        includeVisibleOnlyAddProps
      ),
    get: (id, tenantId) => getWalletAddress(deps, id, tenantId),
    getByUrl: (url, tenantId) => getWalletAddressByUrl(deps, url, tenantId),
    getOrPollByUrl: (url) => getOrPollByUrl(deps, url),
    getPage: (pagination?, sortOrder?, tenantId?) =>
      getWalletAddressPage(deps, pagination, sortOrder, tenantId),
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

function cleanAdditionalProperties(
  additionalProperties: WalletAddressAdditionalPropertyInput[]
): WalletAddressAdditionalPropertyInput[] {
  return additionalProperties
    .map((prop) => ({
      ...prop,
      fieldKey: prop.fieldKey.trim(),
      fieldValue: prop.fieldValue.trim()
    }))
    .filter((prop) => prop.fieldKey.length > 0 && prop.fieldValue.length > 0)
}

async function createWalletAddressUrl(
  deps: ServiceDependencies,
  options: CreateOptions
): Promise<string | WalletAddressError> {
  let tenantWalletAddressUrl = new URL(deps.config.openPaymentsUrl)

  const found = await deps.tenantSettingService.get({
    tenantId: options.tenantId,
    key: TenantSettingKeys.WALLET_ADDRESS_URL.name
  })

  if (!found || found.length === 0) {
    if (!options.isOperator) {
      return WalletAddressError.WalletAddressSettingNotFound
    }
  } else {
    tenantWalletAddressUrl = new URL(found[0].value)
  }

  let tenantBaseUrl = tenantWalletAddressUrl.toString()
  if (!tenantWalletAddressUrl.pathname.endsWith('/')) {
    tenantBaseUrl =
      tenantWalletAddressUrl.origin + tenantWalletAddressUrl.pathname + '/'
  }

  const isValidUrl = (str: string): boolean => {
    try {
      new URL(str)
      return true
    } catch {
      return false
    }
  }

  let finalWalletAddressUrl: string
  if (isValidUrl(options.address)) {
    // in case that client provided full url, verify that it starts with the tenant's URL
    const walletAddressUrl = new URL(options.address)
    if (!walletAddressUrl.href.startsWith(tenantWalletAddressUrl.href)) {
      return WalletAddressError.InvalidUrl
    }
    finalWalletAddressUrl = walletAddressUrl.toString()
  } else {
    // in case that client provided just the path / wallet address name, construct the address using the wallet address url from tenant setting
    try {
      let relativePath = options.address
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.substring(1)
      }
      finalWalletAddressUrl = tenantBaseUrl + relativePath
    } catch (err) {
      return WalletAddressError.InvalidUrl
    }
  }

  if (!isValidWalletAddressUrl(finalWalletAddressUrl)) {
    return WalletAddressError.InvalidUrl
  }

  return finalWalletAddressUrl
}

async function createWalletAddress(
  deps: ServiceDependencies,
  options: CreateOptions
): Promise<WalletAddress | WalletAddressError> {
  const finalWalletAddressUrl = await createWalletAddressUrl(deps, options)

  if (isWalletAddressError(finalWalletAddressUrl)) {
    return finalWalletAddressUrl
  }

  try {
    const asset = await deps.assetService.get(options.assetId, options.tenantId)
    if (!asset) return WalletAddressError.UnknownAsset

    // Remove blank key/value pairs:
    const additionalProperties = options.additionalProperties
      ? cleanAdditionalProperties(options.additionalProperties)
      : undefined

    const walletAddress = await WalletAddress.query(
      deps.knex
    ).insertGraphAndFetch({
      tenantId: options.tenantId,
      address: finalWalletAddressUrl.toLowerCase(),
      publicName: options.publicName,
      assetId: asset.id,
      additionalProperties: additionalProperties
    })
    walletAddress.asset = asset

    await deps.walletAddressCache.set(walletAddress.id, walletAddress)
    return walletAddress
  } catch (err) {
    if (err instanceof ForeignKeyViolationError) {
      if (err.constraint === 'walletaddresses_assetid_foreign') {
        return WalletAddressError.UnknownAsset
      }
    } else if (err instanceof UniqueViolationError) {
      if (err.constraint === 'walletaddresses_url_unique') {
        return WalletAddressError.DuplicateWalletAddress
      }
    }
    throw err
  }
}

async function updateWalletAddress(
  deps: ServiceDependencies,
  { id, status, publicName, additionalProperties }: UpdateOptions
): Promise<WalletAddress | WalletAddressError> {
  const trx = await WalletAddress.startTransaction()
  try {
    const update: UpdateInput = { publicName }
    const walletAddress = await WalletAddress.query(trx)
      .findById(id)
      .throwIfNotFound()

    if (status === 'INACTIVE' && walletAddress.isActive) {
      update.deactivatedAt = new Date()
      await deactivateOpenIncomingPaymentsByWalletAddress(deps, id, trx)
    } else if (status === 'ACTIVE' && !walletAddress.isActive) {
      update.deactivatedAt = null
    }

    const updatedWalletAddress = await walletAddress
      .$query(trx)
      .patchAndFetch(update)
      .throwIfNotFound()
    const asset = await deps.assetService.get(updatedWalletAddress.assetId)
    if (asset) updatedWalletAddress.asset = asset

    // Override all existing additional properties if new ones are provided
    if (additionalProperties) {
      const cleanedProperties = cleanAdditionalProperties(additionalProperties)

      await WalletAddressAdditionalProperty.query(trx)
        .where('walletAddressId', id)
        .delete()

      if (cleanedProperties.length > 0) {
        await WalletAddressAdditionalProperty.query(trx).insert(
          cleanedProperties.map((prop) => ({
            walletAddressId: id,
            ...prop
          }))
        )
      }
    }
    await trx.commit()

    await deps.walletAddressCache.set(
      updatedWalletAddress.id,
      updatedWalletAddress
    )
    return updatedWalletAddress
  } catch (err) {
    await trx.rollback()
    if (err instanceof NotFoundError) {
      return WalletAddressError.UnknownWalletAddress
    }
    throw err
  }
}

async function getWalletAddress(
  deps: ServiceDependencies,
  id: string,
  tenantId?: string
): Promise<WalletAddress | undefined> {
  const inMem = await deps.walletAddressCache.get(id)
  if (inMem) {
    return tenantId && inMem.tenantId !== tenantId ? undefined : inMem
  }

  const query = WalletAddress.query(deps.knex)
  if (tenantId) query.andWhere({ tenantId })

  const walletAddress = await query.findById(id)
  if (walletAddress) {
    const asset = await deps.assetService.get(walletAddress.assetId)
    if (asset) walletAddress.asset = asset
    await deps.walletAddressCache.set(id, walletAddress)
  }
  return walletAddress
}

async function getWalletAdditionalProperties(
  deps: ServiceDependencies,
  walletAddressId: string,
  includeVisibleOnlyAddProps: boolean
): Promise<WalletAddressAdditionalProperty[] | undefined> {
  if (includeVisibleOnlyAddProps) {
    return WalletAddressAdditionalProperty.query(deps.knex).where({
      walletAddressId,
      visibleInOpenPayments: true
    })
  } else {
    return WalletAddressAdditionalProperty.query(deps.knex).where({
      walletAddressId
    })
  }
}

async function getOrPollByUrl(
  deps: ServiceDependencies,
  url: string
): Promise<WalletAddress | undefined> {
  const existingWalletAddress = await getWalletAddressByUrl(deps, url)
  if (existingWalletAddress) return existingWalletAddress

  const webhookRecipients = (
    await deps.tenantSettingService.getSettingsByPrefix(url)
  ).map((tenantSetting) => tenantSetting.tenantId)

  if (!webhookRecipients.length) {
    webhookRecipients.push(deps.config.operatorTenantId)
  }

  await WalletAddressEvent.query(deps.knex).insertGraph({
    type: WalletAddressEventType.WalletAddressNotFound,
    data: {
      walletAddressUrl: url
    },
    tenantId: deps.config.operatorTenantId,
    webhooks: finalizeWebhookRecipients(webhookRecipients, deps.config)
  })

  deps.logger.debug(
    { walletAddressUrl: url },
    'Wallet address not found, polling to see if ASE creates wallet address'
  )

  try {
    return await poll({
      request: () => getWalletAddressByUrl(deps, url),
      pollingFrequencyMs: deps.config.walletAddressPollingFrequencyMs,
      timeoutMs: deps.config.walletAddressLookupTimeoutMs
    })
  } catch (error) {
    return undefined
  }
}

async function getWalletAddressByUrl(
  deps: ServiceDependencies,
  url: string,
  tenantId?: string
): Promise<WalletAddress | undefined> {
  const query = WalletAddress.query(deps.knex)
  if (tenantId) query.andWhere({ tenantId })

  const walletAddress = await query.findOne({
    address: url.toLowerCase()
  })
  if (walletAddress) {
    const asset = await deps.assetService.get(walletAddress.assetId)
    if (asset) walletAddress.asset = asset
  }
  return walletAddress || undefined
}

async function getWalletAddressPage(
  deps: ServiceDependencies,
  pagination?: Pagination,
  sortOrder?: SortOrder,
  tenantId?: string
): Promise<WalletAddress[]> {
  const query = WalletAddress.query(deps.knex)
  if (tenantId) query.where({ tenantId })

  const addresses = await query.getPage(pagination, sortOrder)
  for (const address of addresses) {
    const asset = await deps.assetService.get(address.assetId)
    if (asset) address.asset = asset
  }
  return addresses
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
    for (const walletAddress of walletAddresses) {
      const asset = await deps_.assetService.get(walletAddress.assetId)
      if (asset) walletAddress.asset = asset
    }

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

  await WalletAddressEvent.query(deps.knex).insertGraph({
    walletAddressId: walletAddress.id,
    type: WalletAddressEventType.WalletAddressWebMonetization,
    data: walletAddress.toData(amount),
    withdrawal: {
      accountId: walletAddress.id,
      assetId: walletAddress.assetId,
      amount
    },
    tenantId: walletAddress.tenantId,
    webhooks: finalizeWebhookRecipients([walletAddress.tenantId], deps.config)
  })

  await walletAddress.$query(deps.knex).patch({
    totalEventsAmount: walletAddress.totalEventsAmount + amount
  })
}

async function deactivateOpenIncomingPaymentsByWalletAddress(
  deps: ServiceDependencies,
  walletAddressId: string,
  trx: TransactionOrKnex
) {
  const expiresAt = new Date(
    Date.now() + deps.config.walletAddressDeactivationPaymentGracePeriodMs
  )
  await IncomingPayment.query(trx)
    .patch({ expiresAt })
    .where('walletAddressId', walletAddressId)
    .whereIn('state', [
      IncomingPaymentState.Pending,
      IncomingPaymentState.Processing
    ])
    .where('expiresAt', '>', expiresAt)
}

export interface WalletAddressSubresourceService<
  M extends WalletAddressSubresource
> {
  get(options: GetOptions): Promise<M | undefined>
  create(options: { walletAddressId: string }): Promise<M | string | Error>
  getWalletAddressPage(options: ListOptions): Promise<M[]>
}
