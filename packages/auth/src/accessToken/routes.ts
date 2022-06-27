import { Logger } from 'pino'
import { Access } from '../access/model'
import { AppContext } from '../app'
import { IAppConfig } from '../config/app'
import { AccessTokenService, Introspection } from './service'
import { ClientService } from '../client/service'

interface ServiceDependencies {
  config: IAppConfig
  logger: Logger
  accessTokenService: AccessTokenService
  clientService: ClientService
}

export interface AccessTokenRoutes {
  introspect(ctx: AppContext): Promise<void>
  revoke(ctx: AppContext): Promise<void>
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
    revoke: (ctx: AppContext) => revokeToken(deps, ctx)
  }
}

async function introspectToken(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const { body } = ctx.request
  if (!body['access_token']) {
    ctx.status = 400
    ctx.body = {
      error: 'invalid_request',
      message: 'invalid introspection request'
    }
    return
  }

  try {
    const sig = ctx.headers['signature']
    const sigInput = ctx.headers['signature-input']

    if (
      !sig ||
      !sigInput ||
      typeof sig !== 'string' ||
      typeof sigInput !== 'string'
    ) {
      ctx.status = 400
      ctx.body = {
        error: 'invalid_request'
      }
      return
    }

    const verified = await deps.clientService.verifySigFromBoundKey(
      sig,
      sigInput,
      body['access_token'],
      ctx
    )
    if (!verified) {
      ctx.status = 401
      ctx.body = {
        error: 'invalid_client'
      }
    }
  } catch (err) {
    if ((err as Error).name === 'InvalidSigInputError') {
      ctx.status = 400
      ctx.body = {
        error: 'invalid_request'
      }
      return
    } else {
      ctx.status = 401
      ctx.body = {
        error: 'invalid_client'
      }
      return
    }
  }

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
  try {
    const sig = ctx.headers['signature']
    const sigInput = ctx.headers['signature-input']

    if (
      !sig ||
      !sigInput ||
      typeof sig !== 'string' ||
      typeof sigInput !== 'string'
    ) {
      ctx.status = 400
      ctx.body = {
        error: 'invalid_request'
      }
      return
    }

    const verified = await deps.clientService.verifySigFromBoundKey(
      sig,
      sigInput,
      ctx.params['id'],
      ctx
    )
    if (!verified) {
      ctx.status = 401
      ctx.body = {
        error: 'invalid_client'
      }
    }
  } catch (err) {
    if ((err as Error).name === 'InvalidSigInputError') {
      ctx.status = 400
      ctx.body = {
        error: 'invalid_request'
      }
      return
    } else {
      ctx.status = 401
      ctx.body = {
        error: 'invalid_client'
      }
      return
    }
  }

  const revocationError = await deps.accessTokenService.revoke(ctx.params['id'])
  if (revocationError) {
    return ctx.throw(404, revocationError.message)
  } else {
    ctx.status = 204
  }
}
