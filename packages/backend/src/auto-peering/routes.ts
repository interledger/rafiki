import { AppContext } from '../app'
import { BaseService } from '../shared/baseService'
import { AutoPeeringService } from './service'

export interface ServiceDependencies extends BaseService {
  autoPeeringService: AutoPeeringService
}

export interface AutoPeeringRoutes {
  get(ctx: AppContext): Promise<void>
}

export async function createAutoPeeringRoutes(
  deps_: ServiceDependencies
): Promise<AutoPeeringRoutes> {
  const deps: ServiceDependencies = {
    ...deps_,
    logger: deps_.logger.child({
      service: 'AutoPeeringRoutes'
    })
  }

  return {
    get: (ctx: AppContext) => getPeeringDetails(deps, ctx)
  }
}

async function getPeeringDetails(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const peeringDetails = await deps.autoPeeringService.getPeeringDetails()

  ctx.body = peeringDetails
}
