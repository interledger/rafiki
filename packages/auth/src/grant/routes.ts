import { AppContext } from '../app'
import { GrantService } from './service'
import { ClientService } from '../client/service'
import { BaseService } from '../shared/baseService'

interface ServiceDependencies extends BaseService {
  grantService: GrantService
  clientService: ClientService
}

export interface GrantRoutes {
  auth: {
    post(ctx: AppContext): Promise<void>
  }
  // interaction: {
  //   get(ctx: AppContext): Promise<void>
  //   post(ctx: AppContext): Promise<void>
  // }
}

export function createGrantRoutes({
  grantService,
  clientService,
  logger
}: ServiceDependencies): GrantRoutes {
  const log = logger.child({
    service: 'GrantRoutes'
  })

  const deps = {
    grantService,
    clientService,
    logger: log
  }
  return {
    auth: {
      post: (ctx: AppContext) => postGrantInitiation(deps, ctx)
    }
  }
}

async function postGrantInitiation(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  if (
    !ctx.accepts('application/json') ||
    ctx.get('Content-Type') !== 'application/json'
  ) {
    ctx.status = 406
    ctx.body = {
      error: 'invalid_request'
    }
    return
  }
  const { body } = ctx.request
  const { grantService, clientService } = deps
  if (!grantService.validateGrantRequest(body)) {
    ctx.status = 400
    ctx.body = { error: 'invalid_request' }
    return
  }

  const isValidClient = await clientService.validateClientWithRegistry(
    body.client
  )
  if (!isValidClient) {
    ctx.status = 400
    ctx.body = { error: 'invalid_client' }
    return
  }

  const res = await grantService.initiateGrant(body)
  ctx.status = 200
  ctx.body = res
}
