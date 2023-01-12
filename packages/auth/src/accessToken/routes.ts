import { Logger } from 'pino'
import { Access } from '../access/model'
import { AppContext } from '../app'
import { IAppConfig } from '../config/app'
import { AccessTokenService, Introspection } from './service'
import { accessToBody } from '../shared/utils'
import { ClientService } from '../client/service'

type TokenRequest<BodyT = never> = Omit<AppContext['request'], 'body'> & {
  body: BodyT
}

type TokenContext<BodyT = never> = Omit<AppContext, 'request'> & {
  request: TokenRequest<BodyT>
}

type ManagementRequest = Omit<AppContext['request'], 'params'> & {
  params?: Record<'id', string>
}

type ManagementContext = Omit<AppContext, 'request'> & {
  request: ManagementRequest
}

interface IntrospectBody {
  access_token: string
}
export type IntrospectContext = TokenContext<IntrospectBody>
export type RevokeContext = ManagementContext
export type RotateContext = ManagementContext

interface ServiceDependencies {
  config: IAppConfig
  logger: Logger
  accessTokenService: AccessTokenService
  clientService: ClientService
}

export interface AccessTokenRoutes {
  introspect(ctx: IntrospectContext): Promise<void>
  revoke(ctx: RevokeContext): Promise<void>
  rotate(ctx: RotateContext): Promise<void>
}

export function createAccessTokenRoutes(
  deps_: ServiceDependencies
): AccessTokenRoutes {
  const logger = deps_.logger.child({
    service: 'AccessTokenRoutes'
  })
  const deps = { ...deps_, logger }
  return {
    introspect: (ctx: IntrospectContext) => introspectToken(deps, ctx),
    revoke: (ctx: RevokeContext) => revokeToken(deps, ctx),
    rotate: (ctx: RotateContext) => rotateToken(deps, ctx)
  }
}

async function introspectToken(
  deps: ServiceDependencies,
  ctx: IntrospectContext
): Promise<void> {
  const { body } = ctx.request
  const introspectionResult = await deps.accessTokenService.introspect(
    // body.access_token exists since it is checked for by the request validation
    body['access_token']
  )
  if (introspectionResult) {
    ctx.body = introspectionToBody(introspectionResult)
  } else {
    ctx.throw(404, {
      error: 'invalid_request',
      message: 'token not found'
    })
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

async function revokeToken(
  deps: ServiceDependencies,
  ctx: RevokeContext
): Promise<void> {
  const token = (ctx.headers['authorization'] ?? '').replace('GNAP ', '')
  const { id: managementId } = ctx.params
  await deps.accessTokenService.revoke(managementId, token)
  ctx.status = 204
}

async function rotateToken(
  deps: ServiceDependencies,
  ctx: RotateContext
): Promise<void> {
  const { id: managementId } = ctx.params
  const token = (ctx.headers['authorization'] ?? '').replace('GNAP ', '')
  const result = await deps.accessTokenService.rotate(managementId, token)
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
    ctx.throw(404, { message: result.error.message })
  }
}
