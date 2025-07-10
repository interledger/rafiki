import { BaseService } from '../shared/baseService'
import { TransactionOrKnex } from 'objection'
import { Merchant } from './model'
import { PosDeviceService } from './devices/service'

export interface MerchantService {
  create(name: string): Promise<Merchant>
  delete(id: string): Promise<boolean>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  posDeviceService: PosDeviceService
}

export async function createMerchantService({
  logger,
  knex,
  posDeviceService
}: ServiceDependencies): Promise<MerchantService> {
  const log = logger.child({
    service: 'MerchantService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex,
    posDeviceService
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
  const trx = await deps.knex.transaction()
  try {
    const deleted = await Merchant.query(trx)
      .patch({ deletedAt: new Date() })
      .whereNull('deletedAt')
      .where('id', id)

    if (deleted > 0) {
      await deps.posDeviceService.revokeAllByMerchantId(id)
    }

    await trx.commit()
    return deleted > 0
  } catch (error) {
    await trx.rollback()
    throw error
  }
}
