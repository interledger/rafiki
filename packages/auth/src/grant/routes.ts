import * as crypto from 'crypto'
import { URL } from 'url'
import { AppContext } from '../app'
import { GrantService } from './service'
import { Grant, GrantState } from './model'
import { Access } from '../access/model'
import { ClientService } from '../client/service'
import { BaseService } from '../shared/baseService'
import {
  IncomingPaymentRequest,
  isIncomingPaymentAccessRequest
} from '../access/types'
import { IAppConfig } from '../config/app'
import { AccessTokenService } from '../accessToken/service'
import { AccessService } from '../access/service'
import { accessToBody } from '../shared/utils'
import { AccessToken } from '../accessToken/model'

interface ServiceDependencies extends BaseService {
  grantService: GrantService
  clientService: ClientService
  accessTokenService: AccessTokenService
  accessService: AccessService
  config: IAppConfig
}

export interface GrantRoutes {
  create(ctx: AppContext): Promise<void>
  // TODO: factor this out into separate routes service
  interaction: {
    start(ctx: AppContext): Promise<void>
    finish(ctx: AppContext): Promise<void>
    accept(ctx: AppContext): Promise<void>
    reject(ctx: AppContext): Promise<void>
    details(ctx: AppContext): Promise<void>
  }
  continue(ctx: AppContext): Promise<void>
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
      accept: (ctx: AppContext) => acceptGrant(deps, ctx),
      reject: (ctx: AppContext) => rejectGrant(deps, ctx),
      details: (ctx: AppContext) => getGrantDetails(deps, ctx)
    },
    continue: (ctx: AppContext) => continueGrant(deps, ctx)
  }
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
  const { grantService, config } = deps

  if (
    !deps.config.incomingPaymentInteraction &&
    body.access_token.access
      .map((acc) => {
        return isIncomingPaymentAccessRequest(acc as IncomingPaymentRequest)
      })
      .every((el) => el === true)
  ) {
    const trx = await Grant.startTransaction()
    let grant: Grant
    let accessToken: AccessToken
    try {
      grant = await grantService.create(body, trx)
      accessToken = await deps.accessTokenService.create(grant.id, {
        trx
      })
      await trx.commit()
    } catch (err) {
      await trx.rollback()
      ctx.status = 500
      return
    }
    const access = await deps.accessService.getByGrant(grant.id)
    ctx.status = 200
    ctx.body = createGrantBody({
      domain: deps.config.authServerDomain,
      grant,
      access,
      accessToken
    })
    return
  }

  if (!body.interact) {
    ctx.status = 400
    ctx.body = {
      error: 'interaction_required'
    }
    return
  }

  const grant = await grantService.create(body)
  ctx.status = 200
  ctx.body = {
    interact: {
      redirect:
        config.authServerDomain +
        `/interact/${grant.interactId}/${grant.interactNonce}`,
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

async function getGrantDetails(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const secret = ctx.headers?.['x-idp-secret']
  const { config, grantService } = deps
  if (
    !ctx.headers['x-idp-secret'] ||
    !crypto.timingSafeEqual(
      Buffer.from(secret as string),
      Buffer.from(config.identityServerSecret)
    )
  ) {
    ctx.status = 401
    return
  }
  const { id: interactId, nonce } = ctx.params
  const grant = await grantService.getByInteractionSession(interactId, nonce)
  if (!grant) {
    ctx.status = 404
    return
  }

  for (const access of grant.access) {
    delete access.id
    delete access.createdAt
    delete access.updatedAt
  }

  ctx.body = { access: grant.access }
}

async function startInteraction(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const { id: interactId, nonce } = ctx.params
  const { config, grantService, clientService } = deps
  const grant = await grantService.getByInteractionSession(interactId, nonce)

  if (!grant) {
    ctx.status = 401
    ctx.body = {
      error: 'unknown_request'
    }

    return
  }

  const key = await clientService.getKeyByKid(grant.clientKeyId)

  if (!key) {
    ctx.status = 401
    ctx.body = {
      error: 'invalid_client'
    }
    return
  }

  // TODO: also establish session in redis with short expiry
  ctx.session.nonce = grant.interactNonce

  const interactionUrl = new URL(config.identityServerDomain)
  interactionUrl.searchParams.set('interactId', grant.interactId)
  interactionUrl.searchParams.set('nonce', grant.interactNonce)

  ctx.redirect(interactionUrl.toString())
}

async function acceptGrant(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  // TODO: check redis for a session
  const { id: interactId, nonce } = ctx.params
  const { config, grantService } = deps

  if (
    !ctx.headers['x-idp-secret'] ||
    !crypto.timingSafeEqual(
      Buffer.from(ctx.headers['x-idp-secret'] as string),
      Buffer.from(deps.config.identityServerSecret)
    )
  ) {
    ctx.status = 401
    ctx.body = {
      error: 'invalid_interaction'
    }
    return
  }

  const grant = await grantService.getByInteractionSession(interactId, nonce)

  if (!grant) {
    ctx.status = 404
    ctx.body = {
      error: 'unknown_request'
    }
    return
  }

  if (
    grant.state === GrantState.Revoked ||
    grant.state === GrantState.Rejected
  ) {
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

  ctx.body = {
    redirectUri:
      config.authServerDomain +
      `/${grant.interactId}/${grant.interactNonce}/finish`
  }
}

async function finishInteraction(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const { id: interactId, nonce } = ctx.params
  const sessionNonce = ctx.session.nonce

  // TODO: redirect with this error in query string
  if (sessionNonce !== nonce) {
    ctx.status = 401
    ctx.body = {
      error: 'invalid_request'
    }
    return
  }

  const { grantService, config } = deps
  const grant = await grantService.getByInteractionSession(interactId, nonce)

  // TODO: redirect with this error in query string
  if (!grant) {
    ctx.status = 404
    ctx.body = {
      error: 'unknown_request'
    }
    return
  }

  const clientRedirectUri = new URL(grant.finishUri)
  if (grant.state === GrantState.Granted) {
    const { clientNonce, interactNonce, interactRef } = grant
    const interactUrl = config.identityServerDomain + `/interact/${interactId}`

    // https://datatracker.ietf.org/doc/html/draft-ietf-gnap-core-protocol#section-4.2.3
    const data = `${clientNonce}\n${interactNonce}\n${interactRef}\n${interactUrl}`

    const hash = crypto.createHash('sha3-512').update(data).digest('base64')
    clientRedirectUri.searchParams.set('hash', hash)
    clientRedirectUri.searchParams.set('interact_ref', interactRef)
    ctx.redirect(clientRedirectUri.toString())
  } else if (grant.state === GrantState.Rejected) {
    clientRedirectUri.searchParams.set('result', 'grant_rejected')
    ctx.redirect(clientRedirectUri.toString())
  } else {
    // Grant is not in either an accepted or rejected state
    clientRedirectUri.searchParams.set('result', 'grant_invalid')
    ctx.redirect(clientRedirectUri.toString())
  }
}

// TODO: allow idp to specify the reason for rejection
async function rejectGrant(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  // TODO: check redis for a session
  const { id: interactId, nonce } = ctx.params

  const { grantService, config } = deps

  if (
    !ctx.headers['x-idp-secret'] ||
    !crypto.timingSafeEqual(
      Buffer.from(ctx.headers['x-idp-secret'] as string),
      Buffer.from(deps.config.identityServerSecret)
    )
  ) {
    ctx.status = 401
    ctx.body = {
      error: 'invalid_interaction'
    }
    return
  }

  const grant = await grantService.getByInteractionSession(interactId, nonce)

  if (!grant) {
    ctx.status = 404
    ctx.body = {
      error: 'unknown_request'
    }
    return
  }

  await deps.grantService.rejectGrant(grant.id)

  ctx.body = {
    redirectUri:
      config.authServerDomain +
      `/${grant.interactId}/${grant.interactNonce}/finish`
  }
}

async function continueGrant(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const { id: continueId } = ctx.params
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
  ctx.body = createGrantBody({
    domain: config.authServerDomain,
    grant,
    access,
    accessToken
  })
}

function createGrantBody({
  domain,
  grant,
  access,
  accessToken
}: {
  domain: string
  grant: Grant
  access: Access[]
  accessToken: AccessToken
}) {
  return {
    access_token: {
      value: accessToken.value,
      manage: domain + `/token/${accessToken.managementId}`,
      access: access.map((a: Access) => accessToBody(a)),
      expiresIn: accessToken.expiresIn
    },
    continue: {
      access_token: {
        value: grant.continueToken
      },
      uri: domain + `continue/${grant.continueId}`
    }
  }
}
