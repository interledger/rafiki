import { Logger } from 'pino'
import { Access } from '../access/model'
import { IntrospectContext, RevokeContext, RotateContext } from '../app'
import { IAppConfig } from '../config/app'
import { AccessTokenService, Introspection } from './service'
import { accessToBody } from '../shared/utils'
import { ClientService } from '../client/service'

interface ServiceDependencies {
  config: IAppConfig
  logger: Logger
  accessTokenService: AccessTokenService
  clientService: ClientService
}

export interface AccessTokenRoutes {
  introspect(ctx: IntrospectContext<IntrospectBody>): Promise<void>
  revoke(ctx: RevokeContext<ManageParams>): Promise<void>
  rotate(ctx: RotateContext<ManageParams>): Promise<void>
}

export function createAccessTokenRoutes(
  deps_: ServiceDependencies
): AccessTokenRoutes {
  const logger = deps_.logger.child({
    service: 'AccessTokenRoutes'
  })
  const deps = { ...deps_, logger }
  return {
    introspect: (ctx: IntrospectContext<IntrospectBody>) =>
      introspectToken(deps, ctx),
    revoke: (ctx: RevokeContext<ManageParams>) => revokeToken(deps, ctx),
    rotate: (ctx: RotateContext<ManageParams>) => rotateToken(deps, ctx)
  }
}

interface IntrospectBody {
  access_token: string
}

async function introspectToken(
  deps: ServiceDependencies,
  ctx: IntrospectContext<IntrospectBody>
): Promise<void> {
  const { body } = ctx.request
  const introspectionResult = await deps.accessTokenService.introspect(
    body['access_token']
  )
  if (introspectionResult) {
    ctx.body = introspectionToBody(introspectionResult)
  } else {
    ctx.status = 404
    ctx.body = {
      error: 'invalid_request',
      message: 'token not found'
    }
    return
  }
}

function introspectionToBody(result: Introspection) {
  if (!result.active) return { active: result.active }
  else {
    return {
      active: result.active,
      grant: result.id,
      access: result.access?.map((a: Access) => accessToBody(a)),
      key: result.key,
      client_id: result.clientId
    }
  }
}

interface ManageParams {
  id: string
}

async function revokeToken(
  deps: ServiceDependencies,
  ctx: RevokeContext<ManageParams>
): Promise<void> {
  const { id: managementId } = ctx.params
  await deps.accessTokenService.revoke(managementId)
  ctx.status = 204
}

async function rotateToken(
  deps: ServiceDependencies,
  ctx: RotateContext<ManageParams>
): Promise<void> {
  // TODO: verify Authorization: GNAP ${accessToken} contains correct token value
  const { id: managementId } = ctx.params
  const result = await deps.accessTokenService.rotate(managementId)
  if (result.success == true) {
    ctx.status = 200
    ctx.body = {
      access_token: {
        access: result.access.map((a) => accessToBody(a)),
        value: result.value,
        manage: deps.config.authServerDomain + `/token/${result.managementId}`,
        expires_in: result.expiresIn
      }
    }
  } else {
    ctx.status = 404
    return ctx.throw(ctx.status, result.error.message)
  }
}
