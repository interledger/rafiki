import * as crypto from 'crypto'
import { URL } from 'url'
import { AppContext } from '../app'
import { GrantService, GrantRequest } from './service'
import { ClientService } from '../client/service'
import { BaseService } from '../shared/baseService'
import { isAccessRequest } from '../access/types'
import { IAppConfig } from '../config/app'

interface ServiceDependencies extends BaseService {
  grantService: GrantService
  clientService: ClientService
  config: IAppConfig
}

export interface GrantRoutes {
  create(ctx: AppContext): Promise<void>
  interaction: {
    start(ctx: AppContext): Promise<void>
    finish(ctx: AppContext): Promise<void>
  }
}

export function createGrantRoutes({
  grantService,
  clientService,
  logger,
  config
}: ServiceDependencies): GrantRoutes {
  const log = logger.child({
    service: 'GrantRoutes'
  })

  const deps = {
    grantService,
    clientService,
    logger: log,
    config
  }
  return {
    create: (ctx: AppContext) => createGrantInitiation(deps, ctx),
    interaction: {
      start: (ctx: AppContext) => startInteraction(deps, ctx),
      finish: (ctx: AppContext) => finishInteraction(deps, ctx)
    }
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
