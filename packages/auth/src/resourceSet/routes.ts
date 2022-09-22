import { AppContext } from '../app'
import { BaseService } from '../shared/baseService'
import { ResourceSetService } from './service'

interface ServiceDependencies extends BaseService {
  resourceSetService: ResourceSetService
}

export interface ResourceSetRoutes {
  create(ctx: AppContext): Promise<void>
}

export function createResourceSetRoutes({
  logger,
  resourceSetService
}: ServiceDependencies): ResourceSetRoutes {
  const log = logger.child({
    service: 'ResourceSetRoute'
  })

  const deps = {
    logger: log,
    resourceSetService
  }

  return {
    create: (ctx: AppContext) => createResourceSet(deps, ctx)
  }
}

async function createResourceSet(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const { body } = ctx.request
  const resourceSet = await deps.resourceSetService.create(body)

  ctx.body = {
    resource_reference: resourceSet.id
  }
}
