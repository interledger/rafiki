import * as crypto from 'crypto'
import { URL } from 'url'
import {
  CreateContext,
  ContinueContext,
  StartContext,
  GetContext,
  ChooseContext,
  FinishContext
} from '../app'
import { GrantService, GrantRequest as GrantRequestBody } from './service'
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
  create(ctx: CreateContext<GrantRequestBody>): Promise<void>
  // TODO: factor this out into separate routes service
  interaction: {
    start(ctx: StartContext<StartQuery, StartParams>): Promise<void>
    finish(ctx: FinishContext<FinishParams>): Promise<void>
    acceptOrReject(ctx: ChooseContext<ChooseParams>): Promise<void>
    details(ctx: GetContext<GetParams>): Promise<void>
  }
  continue(
    ctx: ContinueContext<GrantContinueBody, GrantContinueParams>
  ): Promise<void>
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
    create: (ctx: CreateContext<GrantRequestBody>) =>
      createGrantInitiation(deps, ctx),
    interaction: {
      start: (ctx: StartContext<StartQuery, StartParams>) =>
        startInteraction(deps, ctx),
      finish: (ctx: FinishContext<FinishParams>) =>
        finishInteraction(deps, ctx),
      acceptOrReject: (ctx: ChooseContext<ChooseParams>) =>
        handleGrantChoice(deps, ctx),
      details: (ctx: GetContext<GetParams>) => getGrantDetails(deps, ctx)
    },
    continue: (ctx: ContinueContext<GrantContinueBody, GrantContinueParams>) =>
      continueGrant(deps, ctx)
  }
}

async function createGrantInitiation(
  deps: ServiceDependencies,
  ctx: CreateContext<GrantRequestBody>
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
  const clientKeyId = ctx.clientKeyId

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
      grant = await grantService.create(
        {
          ...body,
          clientKeyId
        },
        trx
      )
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

  const client = await deps.clientService.get(body.client)
  if (!client) {
    ctx.status = 400
    ctx.body = {
      error: 'invalid_client'
    }
    return
  }

  const grant = await grantService.create({
    ...body,
    clientKeyId
  })
  ctx.status = 200

  const redirectUri = new URL(
    config.authServerDomain +
      `/interact/${grant.interactId}/${grant.interactNonce}`
  )

  redirectUri.searchParams.set('clientName', client.name)
  redirectUri.searchParams.set('clientUri', client.uri)
  ctx.body = {
    interact: {
      redirect: redirectUri.toString(),
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

interface GetParams {
  id: string
  nonce: string
}

async function getGrantDetails(
  deps: ServiceDependencies,
  ctx: GetContext<GetParams>
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

interface StartQuery {
  clientName: string
  clientUri: string
}

interface StartParams {
  id: string
  nonce: string
}

async function startInteraction(
  deps: ServiceDependencies,
  ctx: StartContext<StartQuery, StartParams>
): Promise<void> {
  deps.logger.info(
    {
      params: ctx.params,
      query: ctx.query
    },
    'start interact params'
  )
  const { id: interactId, nonce } = ctx.params
  const { clientName, clientUri } = ctx.query
  const { config, grantService } = deps
  const grant = await grantService.getByInteractionSession(interactId, nonce)

  if (!grant) {
    ctx.status = 401
    ctx.body = {
      error: 'unknown_request'
    }

    return
  }

  // TODO: also establish session in redis with short expiry
  ctx.session.nonce = grant.interactNonce

  const interactionUrl = new URL(config.identityServerDomain)
  interactionUrl.searchParams.set('interactId', grant.interactId)
  interactionUrl.searchParams.set('nonce', grant.interactNonce)
  interactionUrl.searchParams.set('clientName', clientName as string)
  interactionUrl.searchParams.set('clientUri', clientUri as string)

  ctx.redirect(interactionUrl.toString())
}

export enum GrantChoices {
  Accept = 'accept',
  Reject = 'reject'
}

interface ChooseParams {
  id: string
  nonce: string
  choice: string
}

// TODO: allow idp to specify the reason for rejection
async function handleGrantChoice(
  deps: ServiceDependencies,
  ctx: ChooseContext<ChooseParams>
): Promise<void> {
  // TODO: check redis for a session
  const { id: interactId, nonce, choice } = ctx.params
  const { config, grantService } = deps

  if (
    !ctx.headers['x-idp-secret'] ||
    !crypto.timingSafeEqual(
      Buffer.from(ctx.headers['x-idp-secret'] as string),
      Buffer.from(config.identityServerSecret)
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
    return
  }

  if (choice === GrantChoices.Accept) {
    await grantService.issueGrant(grant.id)
  } else if (choice === GrantChoices.Reject) {
    await grantService.rejectGrant(grant.id)
  } else {
    ctx.status = 404
    return
  }

  ctx.status = 202
}

interface FinishParams {
  id: string
  nonce: string
}

async function finishInteraction(
  deps: ServiceDependencies,
  ctx: FinishContext<FinishParams>
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

interface GrantContinueBody {
  interact_ref: string
}

interface GrantContinueParams {
  id: string
}

async function continueGrant(
  deps: ServiceDependencies,
  ctx: ContinueContext<GrantContinueBody, GrantContinueParams>
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
      expires_in: accessToken.expiresIn
    },
    continue: {
      access_token: {
        value: grant.continueToken
      },
      uri: domain + `/continue/${grant.continueId}`
    }
  }
}
