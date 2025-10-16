import { TransactionOrKnex } from 'objection'
import { Pagination, SortOrder } from '../../shared/baseModel'
import { BaseService } from '../../shared/baseService'
import {
  TENANT_SETTING_VALIDATORS,
  TenantSetting,
  TenantSettingKeys
} from './model'
import { Knex } from 'knex'
import { TenantSettingError } from './errors'

export interface KeyValuePair {
  key: string
  value: string
}

export interface UpdateOptions {
  tenantId: string
  key: string
  value: string
}

export interface CreateOptions {
  tenantId: string
  setting: KeyValuePair[]
}

export interface GetOptions {
  tenantId: string
  key?: string
}

export interface ExtraOptions {
  trx?: Knex.Transaction
  deletedAt?: Date
}

export interface TenantSettingService {
  get: (options: GetOptions) => Promise<TenantSetting[]>
  create: (
    options: CreateOptions,
    extra?: ExtraOptions
  ) => Promise<TenantSetting[] | TenantSettingError>
  update: (
    options: UpdateOptions
  ) => Promise<TenantSetting[] | TenantSettingError>
  delete: (options: GetOptions, extra?: ExtraOptions) => Promise<void>
  getPage: (
    tenantId: string,
    pagination?: Pagination,
    sortOrder?: SortOrder
  ) => Promise<TenantSetting[]>
  getSettingsByPrefix: (prefix: string) => Promise<TenantSetting[]>
}

export interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
}

export async function createTenantSettingService(
  deps_: ServiceDependencies
): Promise<TenantSettingService> {
  const deps: ServiceDependencies = {
    ...deps_,
    logger: deps_.logger.child({ service: 'TenantSettingService ' })
  }

  return {
    get: (options: GetOptions) => getTenantSettings(deps, options),
    create: (options: CreateOptions, extra?: ExtraOptions) =>
      createTenantSetting(deps, options, extra),
    update: (options: UpdateOptions) => updateTenantSetting(deps, options),
    delete: (options: GetOptions, extra?: ExtraOptions) =>
      deleteTenantSetting(deps, options, extra),
    getPage: (
      tenantId: string,
      pagination?: Pagination,
      sortOrder?: SortOrder
    ) => getTenantSettingPageForTenant(deps, tenantId, pagination, sortOrder),
    getSettingsByPrefix: (prefix: string) =>
      getWalletAddressSettingsByPrefix(deps, prefix)
  }
}

async function getTenantSettings(
  deps: ServiceDependencies,
  options: GetOptions
): Promise<TenantSetting[]> {
  return TenantSetting.query(deps.knex).whereNull('deletedAt').andWhere(options)
}

async function deleteTenantSetting(
  deps: ServiceDependencies,
  options: GetOptions,
  extra?: ExtraOptions
) {
  const obj: GetOptions = {
    tenantId: options.tenantId
  }

  if (options.key) {
    obj.key = options.key
  }

  await TenantSetting.query(extra?.trx ?? deps.knex)
    .findOne(obj)
    .whereNull('deletedAt')
    .patch({
      deletedAt: extra?.deletedAt ?? new Date()
    })
}

async function updateTenantSetting(
  deps: ServiceDependencies,
  options: UpdateOptions
): Promise<TenantSetting[] | TenantSettingError> {
  if (
    Object.keys(TENANT_SETTING_VALIDATORS).includes(options.key) &&
    !TENANT_SETTING_VALIDATORS[options.key](options.value)
  ) {
    return TenantSettingError.InvalidSetting
  }

  if (options.key === TenantSettingKeys.WALLET_ADDRESS_URL.name) {
    const existingSetting = await TenantSetting.query(deps.knex).findOne({
      key: TenantSettingKeys.WALLET_ADDRESS_URL.name,
      value: options.value
    })

    if (existingSetting) {
      return TenantSettingError.DuplicateWalletAddressUrl
    }
  }

  return TenantSetting.query(deps.knex)
    .patch({ value: options.value })
    .whereNull('deletedAt')
    .andWhere('tenantId', options.tenantId)
    .andWhere('key', options.key)
    .returning('*')
    .throwIfNotFound()
}

async function createTenantSetting(
  deps: ServiceDependencies,
  options: CreateOptions,
  extra?: ExtraOptions
): Promise<TenantSetting[] | TenantSettingError> {
  for (const setting of options.setting) {
    if (
      Object.keys(TENANT_SETTING_VALIDATORS).includes(setting.key) &&
      !TENANT_SETTING_VALIDATORS[setting.key](setting.value)
    ) {
      return TenantSettingError.InvalidSetting
    }

    if (setting.key === TenantSettingKeys.WALLET_ADDRESS_URL.name) {
      const existingSetting = await TenantSetting.query(
        extra?.trx ?? deps.knex
      ).findOne({
        key: TenantSettingKeys.WALLET_ADDRESS_URL.name,
        value: setting.value
      })

      if (existingSetting) {
        return TenantSettingError.DuplicateWalletAddressUrl
      }
    }
  }

  const dataToUpsert = options.setting
    .filter((setting) => Object.keys(TenantSettingKeys).includes(setting.key))
    .map((s) => ({
      tenantId: options.tenantId,
      ...s
    }))

  if (Object.keys(dataToUpsert).length <= 0) {
    return []
  }

  return TenantSetting.query(extra?.trx ?? deps.knex)
    .insert(dataToUpsert)
    .onConflict(['tenantId', 'key'])
    .merge()
    .returning('*')
}

async function getTenantSettingPageForTenant(
  deps: ServiceDependencies,
  tenantId: string,
  pagination?: Pagination,
  sortOrder?: SortOrder
): Promise<TenantSetting[]> {
  return await TenantSetting.query(deps.knex)
    .whereNull('deletedAt')
    .andWhere('tenantId', tenantId)
    .getPage(pagination, sortOrder)
}

async function getWalletAddressSettingsByPrefix(
  deps: ServiceDependencies,
  prefix: string
): Promise<TenantSetting[]> {
  return await TenantSetting.query(deps.knex)
    .whereILike('value', `${prefix}%`)
    .andWhere({
      key: TenantSettingKeys.WALLET_ADDRESS_URL.name
    })
}
