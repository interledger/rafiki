import { AppContext } from '../app'
import { BaseService } from '../shared/baseService'
import { MerchantService } from './service'
import { POSMerchantError } from './errors'
import { createPosDeviceRoutes, PosDeviceRoutes } from './devices/routes'
import { PosDeviceService } from './devices/service'
import { TransactionOrKnex } from 'objection'

interface ServiceDependencies extends BaseService {
  merchantService: MerchantService
  posDeviceService: PosDeviceService
  knex: TransactionOrKnex
}

type CreateMerchantRequest = Exclude<AppContext['request'], 'body'> & {
  body: {
    name: string
  }
}

export type CreateMerchantContext = Exclude<AppContext, 'request'> & {
  request: CreateMerchantRequest
}

type DeleteMerchantRequest = Exclude<AppContext['request'], 'params'> & {
  params: {
    merchantId: string
  }
}

export type DeleteMerchantContext = Exclude<AppContext, 'request'> & {
  request: DeleteMerchantRequest
}

export interface MerchantRoutes {
  create(ctx: CreateMerchantContext): Promise<void>
  delete(ctx: DeleteMerchantContext): Promise<void>
  devices: PosDeviceRoutes
}

export function createMerchantRoutes(
  deps_: ServiceDependencies
): MerchantRoutes {
  const log = deps_.logger.child({
    service: 'MerchantRoutes'
  })

  const deps = {
    ...deps_,
    logger: log
  }

  return {
    create: (ctx: CreateMerchantContext) => createMerchant(deps, ctx),
    delete: (ctx: DeleteMerchantContext) => deleteMerchant(deps, ctx),
    devices: createPosDeviceRoutes(deps)
  }
}

async function createMerchant(
  deps: ServiceDependencies,
  ctx: CreateMerchantContext
): Promise<void> {
  const { body } = ctx.request
  try {
    const merchant = await deps.merchantService.create(body.name)

    ctx.status = 200
    ctx.body = { id: merchant.id, name: merchant.name }
  } catch (err) {
    throw new POSMerchantError(400, 'Could not create merchant', { err })
  }
}

async function deleteMerchant(
  deps: ServiceDependencies,
  ctx: DeleteMerchantContext
): Promise<void> {
  const { merchantId } = ctx.request.params
  try {
    const deleted = await deps.merchantService.delete(merchantId)

    if (!deleted) {
      throw new POSMerchantError(404, 'Merchant not found')
    }

    ctx.status = 204
  } catch (err) {
    if (err instanceof POSMerchantError) {
      throw err
    }
    throw new POSMerchantError(400, 'Could not delete merchant', { err })
  }
}
