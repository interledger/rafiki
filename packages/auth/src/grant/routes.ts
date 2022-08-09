import * as crypto from 'crypto'
import { URL } from 'url'
import { AppContext } from '../app'
import { GrantService, GrantRequest } from './service'
import { GrantState } from './model'
import { Access } from '../access/model'
import { ClientService } from '../client/service'
import { BaseService } from '../shared/baseService'
import { AccessRequest, isAccessRequest } from '../access/types'
import { IAppConfig } from '../config/app'
import { AccessTokenService } from '../accessToken/service'
import { AccessService } from '../access/service'
import { accessToBody } from '../shared/utils'

interface ServiceDependencies extends BaseService {
  grantService: GrantService
  clientService: ClientService
  accessTokenService: AccessTokenService
  accessService: AccessService
  config: IAppConfig
}

export interface GrantRoutes {
  create(ctx: AppContext): Promise<void>
  interaction: {
    start(ctx: AppContext): Promise<void>
    finish(ctx: AppContext): Promise<void>
    deny(ctx: AppContext): Promise<void>
  }
  continue(ctx: AppContext): Promise<void>
  update(ctx: AppContext): Promise<void>
}

export function createGrantRoutes({
  grantService,
  clientService,
  accessTokenService,
  accessService,
  logger,
  config
}: ServiceDependencies): GrantRoutes {
  const log = logger.child({
    service: 'GrantRoutes'
  })

  const deps = {
    grantService,
    clientService,
    accessTokenService,
    accessService,
    logger: log,
    config
  }
  return {
    create: (ctx: AppContext) => createGrantInitiation(deps, ctx),
    interaction: {
      start: (ctx: AppContext) => startInteraction(deps, ctx),
      finish: (ctx: AppContext) => finishInteraction(deps, ctx),
      deny: (ctx: AppContext) => denyInteraction(deps, ctx)
    },
    continue: (ctx: AppContext) => continueGrant(deps, ctx),
    update: (ctx: AppContext) => updateGrant(deps, ctx)
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
  const { grantService, clientService, config } = deps
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

  const grant = await grantService.initiateGrant(body)
  ctx.status = 201
  ctx.body = {
    interact: {
      redirect: config.identityServerDomain + `/interact/${grant.interactId}`,
      finish: grant.interactNonce
    },
    continue: {
      access_token: {
        value: grant.continueToken
      },
      uri: config.authServerDomain + `/auth/continue/${grant.continueId}`,
      wait: config.waitTimeSeconds
    }
  }
}

async function startInteraction(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const { interactId } = ctx.params
  const { config, grantService, clientService } = deps
  const grant = await grantService.getByInteraction(interactId)

  if (!grant) {
    ctx.status = 401
    ctx.body = {
      error: 'unknown_request'
    }

    return
  }

  ctx.session.interactId = grant.interactId

  const registryData = await clientService.getRegistryDataByKid(
    grant.clientKeyId
  )

  if (!registryData) {
    ctx.status = 401
    ctx.body = {
      error: 'invalid_client'
    }
    return
  }

  const interactionUrl = new URL(config.identityServerDomain)
  interactionUrl.searchParams.set('clientName', registryData.name)
  interactionUrl.searchParams.set('clientUri', registryData.url)

  ctx.redirect(interactionUrl.toString())
}

async function finishInteraction(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const { interactId } = ctx.params
  const interactSession = ctx.session.interactId

  if (!interactSession || !interactId || interactSession !== interactId) {
    ctx.status = 401
    ctx.body = {
      error: 'invalid_request'
    }
    return
  }

  const { grantService, config } = deps
  const grant = await grantService.getByInteraction(interactId)

  if (!grant) {
    ctx.status = 404
    ctx.body = {
      error: 'unknown_request'
    }
    return
  }

  if (grant.state === GrantState.Revoked || grant.state === GrantState.Denied) {
    ctx.status = 401
    ctx.body = {
      error: 'user_denied'
    }
    return
  }

  if (grant.state === GrantState.Granted) {
    ctx.status = 400
    ctx.body = {
      error: 'request_denied'
    }
  }

  await grantService.issueGrant(grant.id)

  const clientRedirectUri = new URL(grant.finishUri)
  const { clientNonce, interactNonce, interactRef } = grant
  const interactUrl = config.identityServerDomain + `/interact/${interactId}`

  // https://datatracker.ietf.org/doc/html/draft-ietf-gnap-core-protocol#section-4.2.3
  const data = `${clientNonce}\n${interactNonce}\n${interactRef}\n${interactUrl}`

  const hash = crypto.createHash('sha3-512').update(data).digest('base64')
  clientRedirectUri.searchParams.set('hash', hash)
  clientRedirectUri.searchParams.set('interact_ref', interactRef)
  ctx.redirect(clientRedirectUri.toString())
}

async function denyInteraction(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const { interactId } = ctx.params
  const interactSession = ctx.session.interactId

  if (!interactSession || !interactId || interactSession !== interactId) {
    ctx.status = 401
    ctx.body = {
      error: 'invalid_request'
    }
    return
  }

  const { grantService } = deps
  const grant = await grantService.getByInteraction(interactId)

  if (!grant) {
    ctx.status = 404
    ctx.body = {
      error: 'unknown_request'
    }
    return
  }

  await deps.grantService.denyGrant(grant.id)

  ctx.status = 200
}

async function continueGrant(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  // TODO: httpsig validation
  const { continueId } = ctx.params
  const continueToken = (ctx.headers['authorization'] as string)?.split(
    'GNAP '
  )[1]
  const { interact_ref: interactRef } = ctx.request.body

  if (!continueId || !continueToken || !interactRef) {
    ctx.status = 401
    ctx.body = {
      error: 'invalid_request'
    }
    return
  }

  const { config, accessTokenService, grantService, accessService } = deps
  const grant = await grantService.getByContinue(
    continueId,
    continueToken,
    interactRef
  )
  if (!grant) {
    ctx.status = 404
    ctx.body = {
      error: 'unknown_request'
    }
    return
  }

  if (grant.state !== GrantState.Granted) {
    ctx.status = 401
    ctx.body = {
      error: 'request_denied'
    }
    return
  }

  const accessToken = await accessTokenService.create(grant.id)
  const access = await accessService.getByGrant(grant.id)

  // TODO: add "continue" to response if additional grant request steps are added
  ctx.body = {
    access_token: {
      value: accessToken.value,
      manage: config.authServerDomain + `/token/${accessToken.managementId}`,
      access: access.map((a: Access) => accessToBody(a)),
      expiresIn: accessToken.expiresIn
    }
  }
}

// eslint-disable @typescript-eslint/no-explicit-any
function isAccessTokenUpdateParameter(
  param: any
): param is {
  access: AccessRequest[]
} {
  return (
    param &&
    param.access &&
    Array.isArray(param.access) &&
    param.access.length > 0 &&
    param.access.every((a: any) => isAccessRequest(a))
  )
}
// eslint-enable

async function updateGrant(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  // TODO: httpsig validation
  const { continueId } = ctx.params
  const continueToken = (ctx.headers['authorization'] as string)?.split(
    'GNAP '
  )[1]
  const {
    interact_ref: interactRef,
    access_token: accessToken
  } = ctx.request.body

  if (
    !continueId ||
    !continueToken ||
    !interactRef ||
    !isAccessTokenUpdateParameter(accessToken)
  ) {
    ctx.status = 401
    ctx.body = {
      error: 'invalid_request'
    }
  } else {
    const { config, accessTokenService, grantService, accessService } = deps
    const grant = await grantService.getByContinue(
      continueId,
      continueToken,
      interactRef
    )

    if (grant) {
      await grantService.update(grant.id, accessToken.access)
      const updatedAccessToken = await accessTokenService.create(grant.id)
      const updatedAccess = await accessService.getByGrant(grant.id)

      // TODO: add "continue" to response if additional grant request steps are added
      ctx.body = {
        access_token: {
          value: updatedAccessToken.value,
          manage:
            config.authServerDomain +
            `/token/${updatedAccessToken.managementId}`,
          access: updatedAccess.map((a: Access) => accessToBody(a)),
          expiresIn: updatedAccessToken.expiresIn
        }
      }
    } else {
      ctx.status = 404
      ctx.body = {
        error: 'unknown_request'
      }
    }
  }
}
