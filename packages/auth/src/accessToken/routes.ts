import { Logger } from 'pino'
import { Access } from '../access/model'
import { AppContext } from '../app'
import { IAppConfig } from '../config/app'
import { AccessTokenService, Introspection } from './service'

interface ServiceDependencies {
  config: IAppConfig
  logger: Logger
  accessTokenService: AccessTokenService
}

export interface AccessTokenRoutes {
  introspect(ctx: AppContext): Promise<void>
  revoke(ctx: AppContext): Promise<void>
  rotate(ctx: AppContext): Promise<void>
}

export function createAccessTokenRoutes(
  deps_: ServiceDependencies
): AccessTokenRoutes {
  const logger = deps_.logger.child({
    service: 'AccessTokenRoutes'
  })
  const deps = { ...deps_, logger }
  return {
    introspect: (ctx: AppContext) => introspectToken(deps, ctx),
    revoke: (ctx: AppContext) => revokeToken(deps, ctx),
    rotate: (ctx: AppContext) => rotateToken(deps, ctx)
  }
}

async function introspectToken(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  // TODO: request validation
  const { body } = ctx.request
  if (body['access_token']) {
    const introspectionResult = await deps.accessTokenService.introspect(
      body['access_token']
    )
    if (introspectionResult) {
      ctx.body = introspectionToBody(introspectionResult)
    } else {
      return ctx.throw(404, 'token not found')
    }
  } else {
    return ctx.throw(400, 'invalid introspection request')
  }
}

function introspectionToBody(result: Introspection) {
  if (!result.active) return { active: result.active }
  else {
    return {
      active: result.active,
      grant: result.id,
      access: result.access?.map((a: Access) => accessToBody(a)),
      key: result.key
    }
  }
}

function accessToBody(access: Access) {
  return Object.fromEntries(
    Object.entries(access.toJSON()).filter(
      ([k, v]) =>
        v != null &&
        k != 'id' &&
        k != 'grantId' &&
        k != 'createdAt' &&
        k != 'updatedAt'
    )
  )
}

async function revokeToken(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  //TODO: verify accessToken with httpsig method

  const revocationError = await deps.accessTokenService.revoke(ctx.params['id'])
  if (revocationError) {
    return ctx.throw(404, revocationError.message)
  } else {
    ctx.status = 204
  }
}

async function rotateToken(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  //TODO: verify accessToken with httpsig method
  const result = await deps.accessTokenService.rotate(ctx.params['id'])
  if (result.success) {
    ctx.status = 200
    ctx.body = {
      access_token: {
        access: [accessToBody(result.access)]
      }
    }
  } else {
    return ctx.throw(400, result.error.message)
  }
}
