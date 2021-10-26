import { PaymentPointer } from './model'
import { BaseService } from '../shared/baseService'
import { AssetService, AssetOptions } from '../asset/service'

export interface CreateOptions {
  asset: AssetOptions
}

export interface PaymentPointerService {
  create(options: CreateOptions): Promise<PaymentPointer>
  get(id: string): Promise<PaymentPointer | undefined>
}

interface ServiceDependencies extends BaseService {
  assetService: AssetService
}

export async function createPaymentPointerService({
  logger,
  knex,
  assetService
}: ServiceDependencies): Promise<PaymentPointerService> {
  const log = logger.child({
    service: 'PaymentPointerService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex,
    assetService
  }
  return {
    create: (options) => createPaymentPointer(deps, options),
    get: (id) => getPaymentPointer(deps, id)
  }
}

async function createPaymentPointer(
  deps: ServiceDependencies,
  options: CreateOptions
): Promise<PaymentPointer> {
  const { id: assetId } = await deps.assetService.getOrCreate(options.asset)
  return await PaymentPointer.query(deps.knex)
    .insertAndFetch({
      assetId
    })
    .withGraphFetched('asset')
}

async function getPaymentPointer(
  deps: ServiceDependencies,
  id: string
): Promise<PaymentPointer | undefined> {
  return await PaymentPointer.query(deps.knex)
    .findById(id)
    .withGraphJoined('asset')
}
