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
import { GNAPErrorCode, GNAPServerRouteError } from '../shared/gnapErrors'
import { generateRouteLogs } from '../shared/utils'
import { AccessItem } from '@interledger/open-payments'

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
  access?: AccessItem[]
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
  const logger = deps_.logger.child(
    {
      service: 'AccessTokenRoutes'
    },
    {
      redact: [
        'requestBody.access_token',
        'accessToken.value',
        'headers.authorization',
        'grant.continueToken'
      ]
    }
  )
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
  const accessToken = body['access_token']
  const access = body['access']
  const tokenInfo = await deps.accessTokenService.introspect(
    // body.access_token exists since it is checked for by the request validation
    accessToken,
    access
  )

  deps.logger.debug(
    {
      ...generateRouteLogs(ctx),
      tokenInfo
    },
    'introspected access token'
  )

  ctx.body = grantToTokenInfo(tokenInfo?.grant, tokenInfo?.access)
}

function grantToTokenInfo(grant?: Grant, access?: Access[]): TokenInfo {
  if (!grant) {
    return {
      active: false
    }
  }
  return {
    active: true,
    grant: grant.id,
    access: access?.map(toOpenPaymentsAccess) ?? [],
    client: grant.client
  }
}

async function revokeToken(
  deps: ServiceDependencies,
  ctx: RevokeContext
): Promise<void> {
  const accessToken = await deps.accessTokenService.revoke(ctx.accessToken.id)

  deps.logger.debug(
    {
      ...generateRouteLogs(ctx),
      accessToken
    },
    'revoked access token'
  )

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
    newToken = await deps.accessTokenService.rotate(ctx.accessToken.id, trx)

    if (!newToken) {
      throw new Error('invalid access token')
    }

    accessItems = await deps.accessService.getByGrant(newToken.grantId, trx)

    await trx.commit()
  } catch (error) {
    await trx.rollback()
    const errorMessage =
      error instanceof Error ? error.message : 'Could not rotate token'
    throw new GNAPServerRouteError(
      404,
      GNAPErrorCode.InvalidRotation,
      errorMessage
    )
  }

  deps.logger.debug(
    {
      ...generateRouteLogs(ctx)
    },
    'rotated access token'
  )

  ctx.status = 200
  ctx.body = {
    access_token: toOpenPaymentsAccessToken(newToken, accessItems, {
      authServerUrl: deps.config.authServerUrl
    })
  }
}
