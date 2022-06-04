import { AppContext } from '../app'
import { GrantService, GrantRequest } from './service'
import { ClientService } from '../client/service'
import { BaseService } from '../shared/baseService'
import { isAccessRequest } from '../access/types'

interface ServiceDependencies extends BaseService {
  grantService: GrantService
  clientService: ClientService
}

export interface GrantRoutes {
  create(ctx: AppContext): Promise<void>
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
    create: (ctx: AppContext) => createGrantInitiation(deps, ctx)
  }
}

function validateGrantRequest(
  grantRequest: GrantRequest
): grantRequest is GrantRequest {
  if (typeof grantRequest.access_token !== 'object') return false
  const { access_token } = grantRequest
  if (typeof access_token.access !== 'object') return false
  for (const access of access_token.access) {
    if (!isAccessRequest(access)) return false
  }

  return grantRequest.interact?.start !== undefined
}

async function createGrantInitiation(
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
  if (!validateGrantRequest(body)) {
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
