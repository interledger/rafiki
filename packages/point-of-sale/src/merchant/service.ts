import { BaseService } from '../shared/baseService'
import { TransactionOrKnex } from 'objection'
import { Merchant } from './model'

export interface MerchantService {
  create(name: string): Promise<Merchant>
  delete(id: string): Promise<boolean>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
}

export async function createMerchantService({
  logger,
  knex
}: ServiceDependencies): Promise<MerchantService> {
  const log = logger.child({
    service: 'MerchantService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex
  }

  return {
    create: (input: string) => createMerchant(deps, input),
    delete: (id: string) => deleteMerchant(deps, id)
  }
}

async function createMerchant(
  deps: ServiceDependencies,
  name: string
): Promise<Merchant> {
  return await Merchant.query(deps.knex).insert({ name })
}

async function deleteMerchant(
  deps: ServiceDependencies,
  id: string
): Promise<boolean> {
  const deleted = await Merchant.query(deps.knex)
    .patch({ deletedAt: new Date() })
    .whereNull('deletedAt')
    .where('id', id)
  return deleted > 0
}
