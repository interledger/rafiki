import { Logger } from 'pino'
import { TokenInfo } from 'token-introspection'
import { toOpenPaymentsAccess } from '../access/model'
import { AppContext } from '../app'
import { IAppConfig } from '../config/app'
import { AccessTokenService } from './service'
import { ClientService } from '../client/service'
import { Grant } from '../grant/model'
import { toOpenPaymentsAccessToken } from './model'
import { AccessService } from '../access/service'

type TokenRequest<BodyT> = Omit<AppContext['request'], 'body'> & {
  body: BodyT
}

type TokenContext<BodyT> = Omit<AppContext, 'request'> & {
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
  accessService: AccessService
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
  const grant = await deps.accessTokenService.introspect(
    // body.access_token exists since it is checked for by the request validation
    body['access_token']
  )
  ctx.body = grantToTokenInfo(grant)
}

function grantToTokenInfo(grant?: Grant): TokenInfo {
  if (!grant) {
    return {
      active: false
    }
  }
  return {
    active: true,
    grant: grant.id,
    access: grant.access.map(toOpenPaymentsAccess),
    client: grant.client
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

  let newToken
  try {
    newToken = await deps.accessTokenService.rotate(managementId, token)
  } catch (error) {
    const errorMessage = 'Could not rotate token'
    deps.logger.error({ error: error && error['message '] }, errorMessage)
    ctx.throw(400, { message: errorMessage })
    return
  }

  if (!newToken) {
    ctx.throw(404, { message: 'Token not found' })
    return
  }

  const accessItems = await deps.accessService.getByGrant(newToken.grantId)

  ctx.status = 200
  ctx.body = {
    access_token: toOpenPaymentsAccessToken(newToken, accessItems, {
      authServerUrl: deps.config.authServerDomain
    })
  }
}
