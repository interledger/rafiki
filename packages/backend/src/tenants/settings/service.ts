import { TransactionOrKnex } from 'objection'
import { Pagination, SortOrder } from '../../shared/baseModel'
import { BaseService } from '../../shared/baseService'
import { TenantSetting, TenantSettingKeys } from './model'
import { Knex } from 'knex'

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
  get: (options: GetOptions) => Promise<TenantSetting | TenantSetting[]>
  create: (
    options: CreateOptions,
    extra?: ExtraOptions
  ) => Promise<TenantSetting[]>
  update: (options: UpdateOptions) => Promise<void>
  delete: (options: GetOptions, extra?: ExtraOptions) => Promise<void>
  getPage: (
    tenantId: string,
    pagination?: Pagination,
    sortOrder?: SortOrder
  ) => Promise<TenantSetting[]>
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
    delete: (options: GetOptions, extra?: ExtraOptions) => deleteTenantSetting(deps, options, extra),
    getPage: (
      tenantId: string,
      pagination?: Pagination,
      sortOrder?: SortOrder
    ) => getTenantSettingPageForTenant(deps, tenantId, pagination, sortOrder)
  }
}

async function getTenantSettings(
  deps: ServiceDependencies,
  options: GetOptions
): Promise<TenantSetting | TenantSetting[]> {
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
): Promise<void> {
  await TenantSetting.query(deps.knex)
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
) {

  const dataToInsert = options.setting
    .filter(setting => Object.keys(TenantSettingKeys).includes(setting.key))
    .map((s) => ({
      tenantId: options.tenantId,
      ...s
    }))

  if (Object.keys(dataToInsert).length <= 0) {
    return []
  }
  
  return TenantSetting.query(extra?.trx ?? deps.knex).insertAndFetch(
    dataToInsert
  )
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
