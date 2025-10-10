import { validate as validateUuid } from 'uuid'
import { Tenant } from './model'
import { BaseService } from '../shared/baseService'
import { TransactionOrKnex, UniqueViolationError } from 'objection'
import { Pagination, SortOrder } from '../shared/baseModel'
import { CacheDataStore } from '../middleware/cache/data-stores'
import type { AuthServiceClient } from '../auth-service-client/client'
import { KeyValuePair, TenantSettingService } from './settings/service'
import { TenantSetting, TenantSettingKeys } from './settings/model'
import type { IAppConfig } from '../config/app'
import { isTenantError, TenantError } from './errors'
import { TenantSettingInput } from '../graphql/generated/graphql'

export interface TenantService {
  get: (id: string, includeDeleted?: boolean) => Promise<Tenant | undefined>
  create: (options: CreateTenantOptions) => Promise<Tenant | TenantError>
  update: (options: UpdateTenantOptions) => Promise<Tenant | TenantError>
  delete: (id: string) => Promise<void>
  getPage: (pagination?: Pagination, sortOrder?: SortOrder) => Promise<Tenant[]>
  updateOperatorApiSecretFromConfig: () => Promise<undefined | TenantError>
  getTenantsByPrefix: (prefix: string) => Promise<Tenant[]>
}
export interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  tenantCache: CacheDataStore<Tenant>
  authServiceClient: AuthServiceClient
  tenantSettingService: TenantSettingService
  config: IAppConfig
}

export async function createTenantService(
  deps_: ServiceDependencies
): Promise<TenantService> {
  const deps: ServiceDependencies = {
    ...deps_,
    logger: deps_.logger.child({ service: 'TenantService' })
  }

  return {
    get: (id: string, includeDeleted?: boolean) =>
      getTenant(deps, id, includeDeleted),
    create: (options) => createTenant(deps, options),
    update: (options) => updateTenant(deps, options),
    delete: (id) => deleteTenant(deps, id),
    getPage: (pagination, sortOrder) =>
      getTenantPage(deps, pagination, sortOrder),
    updateOperatorApiSecretFromConfig: () =>
      updateOperatorApiSecretFromConfig(deps),
    getTenantsByPrefix: (prefix) => getTenantsByPrefix(deps, prefix)
  }
}

async function getTenant(
  deps: ServiceDependencies,
  id: string,
  includeDeleted: boolean = false
): Promise<Tenant | undefined> {
  const inMem = await deps.tenantCache.get(id)
  if (inMem) {
    if (!includeDeleted && inMem.deletedAt) return undefined
    return inMem
  }
  let query = Tenant.query(deps.knex)
  if (!includeDeleted) query = query.whereNull('deletedAt')

  const tenant = await query.findById(id)
  if (tenant) await deps.tenantCache.set(tenant.id, tenant)

  return tenant
}

async function getTenantPage(
  deps: ServiceDependencies,
  pagination?: Pagination,
  sortOrder?: SortOrder
): Promise<Tenant[]> {
  return await Tenant.query(deps.knex).getPage(pagination, sortOrder)
}

interface CreateTenantOptions {
  id?: string
  email?: string
  apiSecret: string
  idpSecret?: string
  idpConsentUrl?: string
  walletAddressPrefix?: string
  publicName?: string
  settings?: TenantSettingInput[]
}

async function createTenant(
  deps: ServiceDependencies,
  options: CreateTenantOptions
): Promise<Tenant | TenantError> {
  const trx = await deps.knex.transaction()
  try {
    const {
      id,
      email,
      apiSecret,
      publicName,
      idpSecret,
      idpConsentUrl,
      walletAddressPrefix,
      settings
    } = options
    if (id && !validateUuid(id)) {
      throw TenantError.InvalidTenantId
    }

    if (
      walletAddressPrefix &&
      !validateWalletAddressPrefix(walletAddressPrefix)
    ) {
      throw TenantError.InvalidTenantInput
    }

    const tenant = await Tenant.query(trx).insertAndFetch({
      id,
      email,
      publicName,
      apiSecret,
      idpSecret,
      idpConsentUrl,
      walletAddressPrefix
    })

    await deps.authServiceClient.tenant.create({
      id: tenant.id,
      apiSecret,
      idpSecret,
      idpConsentUrl
    })

    const createInitialTenantSettingsOptions: {
      tenantId: string
      setting: ReturnType<typeof TenantSetting.default>
    } = {
      tenantId: tenant.id,
      setting: TenantSetting.default()
    }

    const defaultIlpAddressSetting: KeyValuePair = {
      key: TenantSettingKeys.ILP_ADDRESS.name,
      value: `${deps.config.ilpAddress}.${tenant.id}`
    }

    createInitialTenantSettingsOptions.setting.push(defaultIlpAddressSetting)

    if (
      settings &&
      !settings.find(
        (setting) => setting.key === TenantSettingKeys.ILP_ADDRESS.name
      )
    ) {
      createInitialTenantSettingsOptions.setting =
        createInitialTenantSettingsOptions.setting.concat(settings)
    } else if (settings) {
      createInitialTenantSettingsOptions.setting = settings
    }

    deps.logger.info(
      {
        createInitialTenantSettingsOptions
      },
      'initial options'
    )

    await deps.tenantSettingService.create(createInitialTenantSettingsOptions, {
      trx
    })

    await trx.commit()

    await deps.tenantCache.set(tenant.id, tenant)
    return tenant
  } catch (err) {
    await trx.rollback()
    if (err instanceof UniqueViolationError)
      return TenantError.DuplicateWalletAddressPrefix
    if (isTenantError(err)) return err
    throw err
  }
}

interface UpdateTenantOptions {
  id: string
  email?: string
  publicName?: string
  apiSecret?: string
  idpConsentUrl?: string
  idpSecret?: string
  walletAddressPrefix?: string
}

async function updateTenant(
  deps: ServiceDependencies,
  options: UpdateTenantOptions
): Promise<Tenant | TenantError> {
  const trx = await deps.knex.transaction()

  try {
    const {
      id,
      apiSecret,
      email,
      publicName,
      idpConsentUrl,
      idpSecret,
      walletAddressPrefix
    } = options

    if (
      walletAddressPrefix &&
      !validateWalletAddressPrefix(walletAddressPrefix)
    )
      throw TenantError.InvalidTenantInput

    let tenant = await Tenant.query(trx)
      .patchAndFetchById(options.id, {
        email,
        publicName,
        apiSecret,
        idpConsentUrl,
        idpSecret
      })
      .whereNull('deletedAt')
      .throwIfNotFound()

    if (idpConsentUrl || idpSecret || apiSecret) {
      await deps.authServiceClient.tenant.update(id, {
        apiSecret,
        idpConsentUrl,
        idpSecret
      })
    }

    if (walletAddressPrefix) {
      tenant = await tenant.$query(trx).patchAndFetch({
        walletAddressPrefix
      })
    }

    await trx.commit()
    await deps.tenantCache.set(tenant.id, tenant)
    return tenant
  } catch (err) {
    await trx.rollback()
    if (isTenantError(err)) return err
    throw err
  }
}

async function deleteTenant(
  deps: ServiceDependencies,
  id: string
): Promise<void> {
  const trx = await deps.knex.transaction()

  await deps.tenantCache.delete(id)
  try {
    const deletedAt = new Date()

    await deps.tenantSettingService.delete(
      {
        tenantId: id
      },
      { trx, deletedAt }
    )
    await Tenant.query(trx).patchAndFetchById(id, {
      deletedAt
    })
    await deps.authServiceClient.tenant.delete(id, deletedAt)
    await trx.commit()
  } catch (err) {
    await trx.rollback()
    throw err
  }
}

async function updateOperatorApiSecretFromConfig(
  deps: ServiceDependencies
): Promise<undefined | TenantError> {
  const { adminApiSecret, operatorTenantId } = deps.config

  const tenant = await Tenant.query(deps.knex)
    .findById(operatorTenantId)
    .whereNull('deletedAt')

  if (!tenant) {
    return TenantError.TenantNotFound
  }
  if (tenant.apiSecret !== adminApiSecret) {
    await tenant.$query(deps.knex).patch({ apiSecret: adminApiSecret })
    await deps.tenantCache.set(operatorTenantId, tenant)
  }
}

async function getTenantsByPrefix(
  deps: ServiceDependencies,
  prefix: string
): Promise<Tenant[]> {
  return await Tenant.query(deps.knex).whereILike(
    'walletAddressPrefix',
    `${prefix}%`
  )
}

function validateWalletAddressPrefix(prefix: string): boolean {
  try {
    new URL(prefix)
    return true
  } catch (err) {
    return false
  }
}
