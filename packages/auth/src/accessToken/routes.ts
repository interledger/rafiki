import { Logger } from 'pino'
import { TokenInfo } from 'token-introspection'
import { Access, toOpenPaymentsAccess } from '../access/model'
import { AppContext } from '../app'
import { IAppConfig } from '../config/app'
import { AccessTokenService } from './service'
import { ClientService } from '../client/service'
import { Grant } from '../grant/model'
import { AccessToken, toOpenPaymentsAccessToken } from './model'
import { AccessService } from '../access/service'
import { TransactionOrKnex } from 'objection'
import { GrantService } from '../grant/service'

export type TokenHttpSigContext = AppContext & {
  accessToken: AccessToken & {
    grant: NonNullable<AccessToken['grant']>
  }
}

type TokenRequest<BodyT> = Exclude<AppContext['request'], 'body'> & {
  body: BodyT
}

type TokenContext<BodyT> = Exclude<AppContext, 'request'> & {
  request: TokenRequest<BodyT>
}

type ManagementRequest = Exclude<AppContext['request'], 'params'> & {
  params?: Record<'id', string>
}

type ManagementContext = Exclude<TokenHttpSigContext, 'request'> & {
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
  knex: TransactionOrKnex
  accessTokenService: AccessTokenService
  accessService: AccessService
  clientService: ClientService
  grantService: GrantService
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
  await deps.accessTokenService.revoke({
    managementId: ctx.accessToken.managementId,
    tokenValue: ctx.accessToken.value
  })

  ctx.status = 204
}

async function rotateToken(
  deps: ServiceDependencies,
  ctx: RotateContext
): Promise<void> {
  const trx = await AccessToken.startTransaction()

  let accessItems: Access[]
  let newToken: AccessToken | undefined

  try {
    await deps.grantService.lock(ctx.accessToken.grantId, trx)
    newToken = await deps.accessTokenService.rotate({
      grantId: ctx.accessToken.grantId,
      managementId: ctx.accessToken.managementId,
      tokenValue: ctx.accessToken.value,
      expiresIn: ctx.accessToken.expiresIn,
      trx
    })

    if (!newToken) {
      ctx.throw()
    }

    accessItems = await deps.accessService.getByGrant(newToken.grantId, trx)

    await trx.commit()
  } catch (error) {
    await trx.rollback()
    const errorMessage = 'Could not rotate token'
    deps.logger.error({ error: error && error['message'] }, errorMessage)
    ctx.throw(400, { message: errorMessage })
  }

  ctx.status = 200
  ctx.body = {
    access_token: toOpenPaymentsAccessToken(newToken, accessItems, {
      authServerUrl: deps.config.authServerDomain
    })
  }
}
