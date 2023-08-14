import * as crypto from 'crypto'
import { ParsedUrlQuery } from 'querystring'

import { AppContext } from '../app'
import { IAppConfig } from '../config/app'
import { BaseService } from '../shared/baseService'
import { GrantService } from '../grant/service'
import { GrantState, GrantFinalization, isRejectedGrant } from '../grant/model'
import { toOpenPaymentsAccess } from '../access/model'

interface ServiceDependencies extends BaseService {
  grantService: GrantService
  config: IAppConfig
}

type InteractionRequest<
  BodyT = never,
  QueryT = ParsedUrlQuery,
  ParamsT = { [key: string]: string }
> = Omit<AppContext['request'], 'body'> & {
  body: BodyT
  query: ParsedUrlQuery & QueryT
  params: ParamsT
}

type InteractionContext<QueryT, ParamsT> = Exclude<AppContext, 'request'> & {
  request: InteractionRequest<QueryT, ParamsT>
}

interface StartQuery {
  clientName: string
  clientUri: string
}

interface InteractionParams {
  id: string
  nonce: string
}
export type StartContext = InteractionContext<StartQuery, InteractionParams>

export type GetContext = InteractionContext<never, InteractionParams>

export enum GrantChoices {
  Accept = 'accept',
  Reject = 'reject'
}
interface ChooseParams extends InteractionParams {
  choice: string
}
export type ChooseContext = InteractionContext<never, ChooseParams>

export type FinishContext = InteractionContext<never, InteractionParams>

export interface InteractionRoutes {
  start(ctx: StartContext): Promise<void>
  finish(ctx: FinishContext): Promise<void>
  acceptOrReject(ctx: ChooseContext): Promise<void>
  details(ctx: GetContext): Promise<void>
}

export function createInteractionRoutes({
  grantService,
  logger,
  config
}: ServiceDependencies): InteractionRoutes {
  const log = logger.child({
    service: 'InteractionRoutes'
  })

  const deps = {
    grantService,
    logger: log,
    config
  }

  return {
    start: (ctx: StartContext) => startInteraction(deps, ctx),
    finish: (ctx: FinishContext) => finishInteraction(deps, ctx),
    acceptOrReject: (ctx: ChooseContext) => handleGrantChoice(deps, ctx),
    details: (ctx: GetContext) => getGrantDetails(deps, ctx)
  }
}

async function getGrantDetails(
  deps: ServiceDependencies,
  ctx: GetContext
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
    ctx.throw(401)
  }
  const { id: interactId, nonce } = ctx.params
  const grant = await grantService.getByInteractionSession(interactId, nonce)
  if (!grant) {
    ctx.throw(404)
  }

  ctx.body = {
    access: grant.access.map(toOpenPaymentsAccess)
  }
}

async function startInteraction(
  deps: ServiceDependencies,
  ctx: StartContext
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

  if (!grant || grant.state !== GrantState.Processing) {
    ctx.throw(401, { error: 'unknown_request' })
  } else {
    // TODO: also establish session in redis with short expiry
    ctx.session.nonce = grant.interactNonce

    const interactionUrl = new URL(config.identityServerDomain)
    interactionUrl.searchParams.set('interactId', grant.interactId)
    interactionUrl.searchParams.set('nonce', grant.interactNonce)
    interactionUrl.searchParams.set('clientName', clientName as string)
    interactionUrl.searchParams.set('clientUri', clientUri as string)

    ctx.redirect(interactionUrl.toString())
  }
}

// TODO: allow idp to specify the reason for rejection
// https://github.com/interledger/rafiki/issues/886
async function handleGrantChoice(
  deps: ServiceDependencies,
  ctx: ChooseContext
): Promise<void> {
  const { id: interactId, nonce, choice } = ctx.params
  const { config, grantService } = deps

  if (
    !ctx.headers['x-idp-secret'] ||
    !crypto.timingSafeEqual(
      Buffer.from(ctx.headers['x-idp-secret'] as string),
      Buffer.from(config.identityServerSecret)
    )
  ) {
    ctx.throw(401, { error: 'invalid_interaction' })
  }

  const grant = await grantService.getByInteractionSession(interactId, nonce, {
    includeRevoked: true
  })

  if (!grant) {
    ctx.throw(404, { error: 'unknown_request' })
  } else {
    // If grant was already rejected or revoked
    if (
      grant.state === GrantState.Finalized &&
      grant.finalizationReason !== GrantFinalization.Issued
    ) {
      ctx.throw(401, { error: 'user_denied' })
    }

    // If grant is otherwise not pending interaction
    if (grant.state !== GrantState.Pending) {
      ctx.throw(400, { error: 'request_denied' })
    }

    if (choice === GrantChoices.Accept) {
      await grantService.approve(grant.id)
    } else if (choice === GrantChoices.Reject) {
      await grantService.finalize(grant.id, GrantFinalization.Rejected)
    } else {
      ctx.throw(404)
    }

    ctx.status = 202
  }
}

async function finishInteraction(
  deps: ServiceDependencies,
  ctx: FinishContext
): Promise<void> {
  const { id: interactId, nonce } = ctx.params
  const sessionNonce = ctx.session.nonce

  // TODO: redirect with this error in query string
  if (sessionNonce !== nonce) {
    ctx.throw(401, { error: 'invalid_request' })
  }

  const { grantService, config } = deps
  const grant = await grantService.getByInteractionSession(interactId, nonce)

  // TODO: redirect with this error in query string
  if (!grant) {
    ctx.throw(404, { error: 'unknown_request' })
  } else {
    const clientRedirectUri = new URL(grant.finishUri)
    if (grant.state === GrantState.Approved) {
      const { clientNonce, interactNonce, interactRef } = grant
      const interactUrl =
        config.identityServerDomain + `/interact/${interactId}`

      // https://datatracker.ietf.org/doc/html/draft-ietf-gnap-core-protocol#section-4.2.3
      const data = `${clientNonce}\n${interactNonce}\n${interactRef}\n${interactUrl}`

      const hash = crypto.createHash('sha3-512').update(data).digest('base64')
      clientRedirectUri.searchParams.set('hash', hash)
      clientRedirectUri.searchParams.set('interact_ref', interactRef)
      ctx.redirect(clientRedirectUri.toString())
    } else if (isRejectedGrant(grant)) {
      clientRedirectUri.searchParams.set('result', 'grant_rejected')
      ctx.redirect(clientRedirectUri.toString())
    } else {
      // Grant is not in either an accepted or rejected state
      clientRedirectUri.searchParams.set('result', 'grant_invalid')
      ctx.redirect(clientRedirectUri.toString())
    }
  }
}
