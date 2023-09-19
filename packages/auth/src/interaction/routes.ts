import * as crypto from 'crypto'
import { ParsedUrlQuery } from 'querystring'

import { AppContext } from '../app'
import { IAppConfig } from '../config/app'
import { BaseService } from '../shared/baseService'
import { GrantService } from '../grant/service'
import { AccessService } from '../access/service'
import { InteractionService } from '../interaction/service'
import { Interaction, InteractionState } from '../interaction/model'
import { GrantState, GrantFinalization, isRevokedGrant } from '../grant/model'
import { toOpenPaymentsAccess } from '../access/model'

interface ServiceDependencies extends BaseService {
  grantService: GrantService
  accessService: AccessService
  interactionService: InteractionService
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

export enum InteractionChoices {
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

function isInteractionExpired(interaction: Interaction): boolean {
  const now = new Date(Date.now())
  const expiresAt =
    interaction.createdAt.getTime() + interaction.expiresIn * 1000
  return expiresAt < now.getTime()
}

export function createInteractionRoutes({
  grantService,
  accessService,
  interactionService,
  logger,
  config
}: ServiceDependencies): InteractionRoutes {
  const log = logger.child({
    service: 'InteractionRoutes'
  })

  const deps = {
    grantService,
    accessService,
    interactionService,
    logger: log,
    config
  }

  return {
    start: (ctx: StartContext) => startInteraction(deps, ctx),
    finish: (ctx: FinishContext) => finishInteraction(deps, ctx),
    acceptOrReject: (ctx: ChooseContext) => handleInteractionChoice(deps, ctx),
    details: (ctx: GetContext) => getGrantDetails(deps, ctx)
  }
}

async function getGrantDetails(
  deps: ServiceDependencies,
  ctx: GetContext
): Promise<void> {
  const secret = ctx.headers?.['x-idp-secret']
  const { config, interactionService, accessService } = deps
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
  const interaction = await interactionService.getBySession(interactId, nonce)
  if (!interaction || isRevokedGrant(interaction.grant)) {
    ctx.throw(404)
  }

  const access = await accessService.getByGrant(interaction.grantId)

  ctx.body = {
    access: access.map(toOpenPaymentsAccess)
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
  const { config, interactionService, grantService } = deps
  const interaction = await interactionService.getBySession(interactId, nonce)

  if (
    !interaction ||
    interaction.state !== InteractionState.Pending ||
    isRevokedGrant(interaction.grant)
  ) {
    ctx.throw(401, { error: 'unknown_request' })
  }

  const trx = await Interaction.startTransaction()
  try {
    // TODO: also establish session in redis with short expiry
    await grantService.markPending(interaction.id, trx)
    await trx.commit()

    ctx.session.nonce = interaction.nonce

    const interactionUrl = new URL(config.identityServerDomain)
    interactionUrl.searchParams.set('interactId', interaction.id)
    interactionUrl.searchParams.set('nonce', interaction.nonce)
    interactionUrl.searchParams.set('clientName', clientName as string)
    interactionUrl.searchParams.set('clientUri', clientUri as string)

    ctx.redirect(interactionUrl.toString())
  } catch (err) {
    await trx.rollback()
    ctx.throw(500)
  }
}

// TODO: allow idp to specify the reason for rejection
// https://github.com/interledger/rafiki/issues/886
async function handleInteractionChoice(
  deps: ServiceDependencies,
  ctx: ChooseContext
): Promise<void> {
  const { id: interactId, nonce, choice } = ctx.params
  const { config, interactionService } = deps

  if (
    !ctx.headers['x-idp-secret'] ||
    !crypto.timingSafeEqual(
      Buffer.from(ctx.headers['x-idp-secret'] as string),
      Buffer.from(config.identityServerSecret)
    )
  ) {
    ctx.throw(401, { error: 'invalid_interaction' })
  }

  const interaction = await interactionService.getBySession(interactId, nonce)
  if (!interaction) {
    ctx.throw(404, { error: 'unknown_request' })
  } else {
    const { grant } = interaction
    // If grant was already rejected or revoked
    if (
      grant.state === GrantState.Finalized &&
      grant.finalizationReason !== GrantFinalization.Issued
    ) {
      ctx.throw(401, { error: 'user_denied' })
    }

    // If grant is otherwise not pending interaction
    if (
      interaction.state !== InteractionState.Pending ||
      isInteractionExpired(interaction)
    ) {
      ctx.throw(400, { error: 'request_denied' })
    }

    if (choice === InteractionChoices.Accept) {
      await interactionService.approve(interactId)
    } else if (choice === InteractionChoices.Reject) {
      await interactionService.deny(interactId)
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

  const { grantService, interactionService, config } = deps
  const interaction = await interactionService.getBySession(interactId, nonce)

  // TODO: redirect with this error in query string
  if (!interaction || isRevokedGrant(interaction.grant)) {
    ctx.throw(404, { error: 'unknown_request' })
  } else {
    const { grant } = interaction
    const clientRedirectUri = new URL(grant.finishUri as string)
    if (interaction.state === InteractionState.Approved) {
      await grantService.approve(interaction.grantId)

      const {
        grant: { clientNonce },
        nonce: interactNonce,
        ref: interactRef
      } = interaction
      const grantRequestUrl = config.authServerDomain + `/`

      // https://datatracker.ietf.org/doc/html/draft-ietf-gnap-core-protocol#section-4.2.3
      const data = `${clientNonce}\n${interactNonce}\n${interactRef}\n${grantRequestUrl}`

      const hash = crypto.createHash('sha3-512').update(data).digest('base64')
      clientRedirectUri.searchParams.set('hash', hash)
      clientRedirectUri.searchParams.set('interact_ref', interactRef)
      ctx.redirect(clientRedirectUri.toString())
    } else if (interaction.state === InteractionState.Denied) {
      await grantService.finalize(grant.id, GrantFinalization.Rejected)
      clientRedirectUri.searchParams.set('result', 'grant_rejected')
      ctx.redirect(clientRedirectUri.toString())
    } else {
      // Interaction is not in an accepted or rejected state
      clientRedirectUri.searchParams.set('result', 'grant_invalid')
      ctx.redirect(clientRedirectUri.toString())
    }
  }
}
