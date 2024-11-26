import { TransactionOrKnex } from 'objection'
import { Pagination, SortOrder } from '../../shared/baseModel'
import { BaseService } from '../../shared/baseService'
import { TenantSettingError } from './errors'
import { TenantSetting } from './model'

export interface KeyValuePair {
  key: string
  value: string
}

export interface CreateOptions {
  tenantId: string
  settings: KeyValuePair[]
}

export interface TenantSettingService {
  create(
    createOptions: CreateOptions
  ): Promise<TenantSetting[] | TenantSettingError>
  getForTenant(tenantId: string): Promise<TenantSetting[] | undefined>
  getPage(
    tenantId: string,
    pagination?: Pagination,
    sortOrder?: SortOrder
  ): Promise<TenantSetting[]>
}

export interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
}

export async function createTenantSettingService(
  deps_: ServiceDependencies
): Promise<TenantSettingService> {
  const deps: ServiceDependencies = {
    logger: deps_.logger.child({
      service: 'TenantSettingService'
    }),
    knex: deps_.knex
  }

  return {
    create: (createOptions: CreateOptions) =>
      createTenantSettings(deps, createOptions),
    getForTenant: (tenantId: string) => getSettingsForTenant(deps, tenantId),
    getPage: (
      tenantId: string,
      pagination?: Pagination,
      sortOrder?: SortOrder
    ) => getTenantSettingsPage(deps, tenantId, pagination, sortOrder)
  }
}

async function createTenantSettings(
  deps: ServiceDependencies,
  createOptions: CreateOptions
): Promise<TenantSetting[] | TenantSettingError> {
  const data = createOptions.settings.map((setting) => ({
    ...setting,
    tenantId: createOptions.tenantId
  }))

  return TenantSetting.query(deps.knex)
    .insert(data)
    .returning(['key', 'value', 'createdAt', 'updatedAt'])
}

async function getTenantSettingsPage(
  deps: ServiceDependencies,
  tenantId: string,
  pagination?: Pagination,
  sortOrder?: SortOrder
): Promise<TenantSetting[]> {
  return TenantSetting.query(deps.knex)
    .where('tenantId', tenantId)
    .getPage(pagination, sortOrder)
    .returning(['key', 'value', 'createdAt', 'updatedAt'])
}

async function getSettingsForTenant(
  deps: ServiceDependencies,
  tenantId: string
): Promise<TenantSetting[] | undefined> {
  return TenantSetting.query(deps.knex)
    .where('tenantId', tenantId)
    .returning(['key', 'value', 'createdAt', 'updatedAt'])
}
