import { BaseService } from '../shared/baseService'
import { TransactionOrKnex } from 'objection'
import { Tenant } from './model'
import { IAppConfig } from '../config/app'

export interface CreateOptions {
  id: string
  apiSecret: string
  idpConsentUrl?: string
  idpSecret?: string
}

export interface TenantService {
  create(input: CreateOptions): Promise<Tenant>
  get(id: string): Promise<Tenant | undefined>
  update(
    id: string,
    input: Partial<Omit<CreateOptions, 'id'>>
  ): Promise<Tenant | undefined>
  delete(id: string, deletedAt: Date): Promise<boolean>
  updateOperatorApiSecretFromConfig(): Promise<void>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  config: IAppConfig
}

export async function createTenantService({
  logger,
  knex,
  config
}: ServiceDependencies): Promise<TenantService> {
  const log = logger.child({
    service: 'TenantService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex,
    config
  }

  return {
    create: (input: CreateOptions) => createTenant(deps, input),
    get: (id: string) => getTenant(deps, id),
    update: (id: string, input: Partial<Omit<CreateOptions, 'id'>>) =>
      updateTenant(deps, id, input),
    delete: (id: string, deletedAt: Date) => deleteTenant(deps, id, deletedAt),
    updateOperatorApiSecretFromConfig: () =>
      updateOperatorApiSecretFromConfig(deps)
  }
}

async function createTenant(
  deps: ServiceDependencies,
  input: CreateOptions
): Promise<Tenant> {
  return await Tenant.query(deps.knex).insert(input)
}

async function getTenant(
  deps: ServiceDependencies,
  id: string
): Promise<Tenant | undefined> {
  return await Tenant.query(deps.knex)
    .findById(id)
    .whereNull('deletedAt')
    .first()
}

async function updateTenant(
  deps: ServiceDependencies,
  id: string,
  input: Partial<Omit<CreateOptions, 'id'>>
): Promise<Tenant | undefined> {
  return await Tenant.query(deps.knex)
    .whereNull('deletedAt')
    .patchAndFetchById(id, input)
}

async function deleteTenant(
  deps: ServiceDependencies,
  id: string,
  deletedAt: Date
): Promise<boolean> {
  const deleted = await Tenant.query(deps.knex)
    .patch({ deletedAt })
    .whereNull('deletedAt')
    .where('id', id)
  return deleted > 0
}

async function updateOperatorApiSecretFromConfig(
  deps: ServiceDependencies
): Promise<void> {
  const { adminApiSecret, operatorTenantId } = deps.config

  const tenant = await Tenant.query(deps.knex)
    .findById(operatorTenantId)
    .whereNull('deletedAt')

  if (!tenant) {
    throw new Error(
      'Could not find operator tenant when updating the operator API secret from config'
    )
  }
  if (tenant.apiSecret !== adminApiSecret) {
    await tenant.$query(deps.knex).patch({ apiSecret: adminApiSecret })
  }
}
