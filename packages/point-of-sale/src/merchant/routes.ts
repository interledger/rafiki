import { AppContext } from '../app'
import { BaseService } from '../shared/baseService'
import { MerchantService } from './service'
import { MerchantRouteError } from './errors'

interface ServiceDependencies extends BaseService {
  merchantService: MerchantService
}

type CreateMerchantRequest = Exclude<AppContext['request'], 'body'> & {
  body: {
    name: string
  }
}

export type CreateMerchantContext = Exclude<AppContext, 'request'> & {
  request: CreateMerchantRequest
}

export interface MerchantRoutes {
  create(ctx: CreateMerchantContext): Promise<void>
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
    create: (ctx: CreateMerchantContext) => createMerchant(deps, ctx)
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
    throw new MerchantRouteError(400, 'Could not create merchant', undefined, {
      err
    })
  }
}
