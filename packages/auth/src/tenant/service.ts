import { BaseService } from '../shared/baseService'
import { TransactionOrKnex } from 'objection'
import { Tenant } from './model'

export interface CreateOptions {
  id: string
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
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
}

export async function createTenantService({
  logger,
  knex
}: ServiceDependencies): Promise<TenantService> {
  const log = logger.child({
    service: 'TenantService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex
  }

  return {
    create: (input: CreateOptions) => createTenant(deps, input),
    get: (id: string) => getTenant(deps, id),
    update: (id: string, input: Partial<Omit<CreateOptions, 'id'>>) =>
      updateTenant(deps, id, input),
    delete: (id: string, deletedAt: Date) => deleteTenant(deps, id, deletedAt)
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
