import { ParsedUrlQuery } from 'querystring'

import { AppContext } from '../app'
import { BaseService } from '../shared/baseService'

interface ServiceDependencies extends BaseService {
  merchantService: MerchantService
}

type CreateMerchantRequest = Exclude<AppContext['request'], 'body'> & {
  body: {
    name: string
  }
}

type CreateMerchantContext = Exclude<AppContext, 'request'> & {
  request: CreateMerchantRequest
}

export interface MerchantRoutes {
  create(ctx: CreateMerchantContext): Promise<void>
}

export function createMerchantRoutes(deps_: ServiceDependencies): MerchantRoutes {
  const log = deps_.logger.child(
    {
      service: 'MerchantRoutes'
    }
  )

  const deps = {
    ...deps_,
    logger: log
  }

  return {
    create: (ctx: CreateMerchantContext) => createMerchant(deps, ctx)
  }
}

async function createMerchant(deps: ServiceDependencies, ctx: CreateMerchantContext): Promise<void> {
  const merchant = await deps.merchantService.create(ctx.request.body.name)
}
