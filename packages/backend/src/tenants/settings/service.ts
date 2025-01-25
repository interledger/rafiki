import { TransactionOrKnex } from 'objection'
import { Pagination, SortOrder } from '../../shared/baseModel'
import { BaseService } from '../../shared/baseService'
import { TenantSetting } from './model'
import { TenantService } from '../service'

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

export interface TenantSettingService {
  get: (options: GetOptions) => Promise<TenantSetting | TenantSetting[]>
  create: (options: CreateOptions) => Promise<TenantSetting[]>
  update: (options: UpdateOptions) => Promise<void>
  delete: (options: GetOptions) => Promise<void>
  getPage: (
    tenantId: string,
    pagination?: Pagination,
    sortOrder?: SortOrder
  ) => Promise<TenantSetting[]>
}

export interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  tenantService: TenantService
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
    create: (options: CreateOptions) => createTenantSetting(deps, options),
    update: (options: UpdateOptions) => updateTenantSetting(deps, options),
    delete: (options: GetOptions) => deleteTenantSetting(deps, options),
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
  options: GetOptions
) {
  await TenantSetting.query(deps.knex).findOne(options).patch({
    deletedAt: new Date()
  })
}

async function updateTenantSetting(
  deps: ServiceDependencies,
  options: UpdateOptions
): Promise<void> {
  await TenantSetting.query(deps.knex)
    .patch({
      value: options.value
    })
    .whereNull('deletedAt')
    .andWhere('tenantId', options.tenantId)
    .andWhere('key', options.key)
    .throwIfNotFound()
}

async function createTenantSetting(
  deps: ServiceDependencies,
  options: CreateOptions
) {
  const dataToInsert = options.setting.map((s) => ({
    tenantId: options.tenantId,
    ...s
  }))

  return TenantSetting.query(deps.knex).insertAndFetch(dataToInsert)
}

async function getTenantSettingPageForTenant(
  deps: ServiceDependencies,
  tenantId: string,
  pagination?: Pagination,
  sortOrder?: SortOrder
): Promise<TenantSetting[]> {
  const tenant = await deps.tenantService.get(tenantId)
  if (!tenant) {
    return []
  }

  return await TenantSetting.query(deps.knex)
    .whereNull('deletedAt')
    .andWhere('tenantId', tenantId)
    .getPage(pagination, sortOrder)
}
