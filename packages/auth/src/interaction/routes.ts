import * as crypto from 'crypto'
import { ParsedUrlQuery } from 'querystring'

import { AppContext } from '../app'
import { IAppConfig } from '../config/app'
import { BaseService } from '../shared/baseService'
import { GrantService } from '../grant/service'
import { AccessService } from '../access/service'
import { InteractionService } from '../interaction/service'
import { Interaction, InteractionState } from '../interaction/model'
import {
  Grant,
  FinishableGrant,
  GrantState,
  GrantFinalization,
  isRevokedGrant,
  isFinishableGrant
} from '../grant/model'
import { toOpenPaymentsAccess } from '../access/model'
import { GNAPErrorCode, throwGNAPError } from '../shared/gnapErrors'
import { generateRouteLogs } from '../shared/utils'

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
  const { config, interactionService, accessService, logger } = deps
  const { id: interactId, nonce } = ctx.params
  if (
    !secret ||
    !crypto.timingSafeEqual(
      Buffer.from(secret as string),
      Buffer.from(config.identityServerSecret)
    )
  ) {
    logger.error(
      generateRouteLogs(ctx),
      'tried to retrieve interaction with invalid x-idp-secret'
    )
    throwGNAPError(
      ctx,
      401,
      GNAPErrorCode.InvalidRequest,
      'invalid x-idp-secret'
    )
  }
  const interaction = await interactionService.getBySession(interactId, nonce)
  if (!interaction || isRevokedGrant(interaction.grant)) {
    logger.error(
      {
        ...generateRouteLogs(ctx),
        interaction
      },
      'tried to retrieve unknown interaction'
    )
    throwGNAPError(
      ctx,
      404,
      GNAPErrorCode.UnknownInteraction,
      'unknown interaction'
    )
  }

  const access = await accessService.getByGrant(interaction.grantId)

  deps.logger.debug(
    {
      ...generateRouteLogs(ctx),
      interaction
    },
    'retrieved interaction details'
  )

  ctx.body = {
    access: access.map(toOpenPaymentsAccess),
    state: interaction.state
  }
}

async function startInteraction(
  deps: ServiceDependencies,
  ctx: StartContext
): Promise<void> {
  deps.logger.debug(
    {
      params: ctx.params,
      query: ctx.query
    },
    'start interact params'
  )
  const { id: interactId, nonce } = ctx.params
  const { clientName, clientUri } = ctx.query
  const { config, interactionService, grantService, logger } = deps
  const interaction = await interactionService.getBySession(interactId, nonce)

  if (
    !interaction ||
    interaction.state !== InteractionState.Pending ||
    isRevokedGrant(interaction.grant)
  ) {
    logger.error(
      {
        ...generateRouteLogs(ctx),
        interaction
      },
      'tried to start unknown interaction'
    )
    throwGNAPError(
      ctx,
      401,
      GNAPErrorCode.UnknownInteraction,
      'unknown interaction'
    )
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

    logger.debug(
      {
        ...generateRouteLogs(ctx),
        interaction
      },
      'started interaction'
    )

    ctx.redirect(interactionUrl.toString())
  } catch (err) {
    await trx.rollback()
    logger.error(
      {
        ...generateRouteLogs(ctx),
        interaction
      },
      'failed to start interaction'
    )
    throwGNAPError(
      ctx,
      500,
      GNAPErrorCode.RequestDenied,
      'internal server error'
    )
  }
}

// TODO: allow idp to specify the reason for rejection
// https://github.com/interledger/rafiki/issues/886
async function handleInteractionChoice(
  deps: ServiceDependencies,
  ctx: ChooseContext
): Promise<void> {
  const { id: interactId, nonce, choice } = ctx.params
  const { config, interactionService, logger } = deps
  const secret = ctx.headers['x-idp-secret']

  if (
    !secret ||
    !crypto.timingSafeEqual(
      Buffer.from(secret as string),
      Buffer.from(config.identityServerSecret)
    )
  ) {
    logger.error(generateRouteLogs(ctx), 'invalid x-idp-secret')
    throwGNAPError(
      ctx,
      401,
      GNAPErrorCode.InvalidInteraction,
      'invalid x-idp-secret'
    )
  }

  const interaction = await interactionService.getBySession(interactId, nonce)
  if (!interaction) {
    logger.error(generateRouteLogs(ctx), 'tried to handle unknown interaction')
    throwGNAPError(
      ctx,
      404,
      GNAPErrorCode.UnknownInteraction,
      'unknown interaction'
    )
  } else {
    const { grant } = interaction
    // If grant was already rejected or revoked
    if (
      grant.state === GrantState.Finalized &&
      grant.finalizationReason !== GrantFinalization.Issued
    ) {
      logger.error(
        {
          ...generateRouteLogs(ctx),
          interaction
        },
        'tried to handle invalid interaction for rejected/revoked grant'
      )
      throwGNAPError(
        ctx,
        401,
        GNAPErrorCode.UserDenied,
        'user denied interaction'
      )
    }

    // If grant is otherwise not pending interaction
    if (
      interaction.state !== InteractionState.Pending ||
      isInteractionExpired(interaction)
    ) {
      logger.error(
        {
          ...generateRouteLogs(ctx),
          interaction
        },
        'tried to handle non-pending interaction'
      )
      throwGNAPError(
        ctx,
        400,
        GNAPErrorCode.InvalidInteraction,
        'invalid interaction'
      )
    }

    if (choice === InteractionChoices.Accept) {
      logger.debug(
        {
          ...generateRouteLogs(ctx),
          interaction
        },
        'interaction approved'
      )
      await interactionService.approve(interactId)
    } else if (choice === InteractionChoices.Reject) {
      logger.debug(
        {
          ...generateRouteLogs(ctx),
          interaction
        },
        'interaction rejected'
      )
      await interactionService.deny(interactId)
    } else {
      logger.error(
        {
          ...generateRouteLogs(ctx),
          interaction
        },
        'invalid interaction choice'
      )
      throwGNAPError(
        ctx,
        400,
        GNAPErrorCode.InvalidRequest,
        'invalid interaction choice'
      )
    }

    ctx.status = 202
  }
}

async function handleFinishableGrant(
  deps: ServiceDependencies,
  ctx: FinishContext,
  interaction: Interaction,
  grant: FinishableGrant
): Promise<void> {
  const { grantService, config, logger } = deps
  const clientRedirectUri = new URL(grant.finishUri as string)
  if (interaction.state === InteractionState.Approved) {
    await grantService.approve(interaction.grantId)

    const { clientNonce } = grant
    const { nonce: interactNonce, ref: interactRef } = interaction
    const grantRequestUrl = config.authServerDomain + `/`

    // https://datatracker.ietf.org/doc/html/draft-ietf-gnap-core-protocol#section-4.2.3
    const data = `${clientNonce}\n${interactNonce}\n${interactRef}\n${grantRequestUrl}`

    const hash = crypto.createHash('sha-256').update(data).digest('base64')
    clientRedirectUri.searchParams.set('hash', hash)
    clientRedirectUri.searchParams.set('interact_ref', interactRef)

    logger.debug(
      {
        ...generateRouteLogs(ctx),
        grant,
        interaction
      },
      'approved finishable grant'
    )

    ctx.redirect(clientRedirectUri.toString())
  } else if (interaction.state === InteractionState.Denied) {
    await grantService.finalize(grant.id, GrantFinalization.Rejected)
    clientRedirectUri.searchParams.set('result', 'grant_rejected')

    logger.debug(
      {
        ...generateRouteLogs(ctx),
        grant,
        interaction
      },
      'rejected finishable grant'
    )

    ctx.redirect(clientRedirectUri.toString())
  } else {
    // Interaction is not in an accepted or rejected state
    clientRedirectUri.searchParams.set('result', 'grant_invalid')

    logger.debug(
      {
        ...generateRouteLogs(ctx),
        grant,
        interaction
      },
      'tried to finalize finishable grant with incomplete/invalid interaction'
    )

    ctx.redirect(clientRedirectUri.toString())
  }
}

async function handleUnfinishableGrant(
  deps: ServiceDependencies,
  ctx: FinishContext,
  interaction: Interaction,
  grant: Grant
): Promise<void> {
  const { grantService, logger } = deps
  if (interaction.state === InteractionState.Approved) {
    await grantService.approve(grant.id)

    logger.debug(
      {
        ...generateRouteLogs(ctx),
        interaction,
        grant
      },
      'approved unfinishable grant'
    )
    ctx.status = 202
    return
  } else if (interaction.state === InteractionState.Denied) {
    await grantService.finalize(grant.id, GrantFinalization.Rejected)

    logger.debug(
      {
        ...generateRouteLogs(ctx),
        interaction,
        grant
      },
      'rejected unfinishable grant'
    )
    ctx.status = 202
    return
  } else {
    // Interaction is not in an accepted or rejected state
    logger.error(
      {
        ...generateRouteLogs(ctx),
        interaction,
        grant
      },
      'tried to finalize unfinishable grant with incomplete/invalid interaction'
    )
    throwGNAPError(
      ctx,
      401,
      GNAPErrorCode.InvalidInteraction,
      'interaction is not active'
    )
  }
}

async function finishInteraction(
  deps: ServiceDependencies,
  ctx: FinishContext
): Promise<void> {
  const { id: interactId, nonce } = ctx.params
  const { interactionService, logger } = deps
  const sessionNonce = ctx.session.nonce

  // TODO: redirect with this error in query string
  if (sessionNonce !== nonce) {
    logger.error(generateRouteLogs(ctx), 'invalid session nonce provided')
    throwGNAPError(ctx, 401, GNAPErrorCode.InvalidRequest, 'invalid session')
  }

  const interaction = await interactionService.getBySession(interactId, nonce)

  // TODO: redirect with this error in query string
  if (!interaction || isRevokedGrant(interaction.grant)) {
    logger.error(
      {
        ...generateRouteLogs(ctx),
        interaction
      },
      'tried to finish unknown interaction'
    )
    throwGNAPError(
      ctx,
      404,
      GNAPErrorCode.UnknownInteraction,
      'unknown interaction'
    )
  }

  const { grant } = interaction
  if (isFinishableGrant(grant)) {
    await handleFinishableGrant(deps, ctx, interaction, grant)
  } else {
    await handleUnfinishableGrant(deps, ctx, interaction, grant)
  }
}
