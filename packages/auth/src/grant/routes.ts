import { ParsedUrlQuery } from 'querystring'

import { AppContext } from '../app'
import { GrantService, GrantRequest as GrantRequestBody } from './service'
import {
  Grant,
  GrantFinalization,
  GrantState,
  toOpenPaymentPendingGrant,
  toOpenPaymentsGrant,
  isRevokedGrant,
  isRejectedGrant
} from './model'
import { ClientService } from '../client/service'
import { BaseService } from '../shared/baseService'
import { IAppConfig } from '../config/app'
import { AccessTokenService } from '../accessToken/service'
import { AccessService } from '../access/service'
import { AccessToken } from '../accessToken/model'
import { InteractionService } from '../interaction/service'
import { canSkipInteraction } from './utils'

interface ServiceDependencies extends BaseService {
  grantService: GrantService
  clientService: ClientService
  accessTokenService: AccessTokenService
  accessService: AccessService
  interactionService: InteractionService
  config: IAppConfig
}

type GrantRequest<BodyT = never, QueryT = ParsedUrlQuery> = Exclude<
  AppContext['request'],
  'body'
> & {
  body: BodyT
  query: ParsedUrlQuery & QueryT
}

type GrantContext<BodyT = never, QueryT = ParsedUrlQuery> = Exclude<
  AppContext,
  'request'
> & {
  request: GrantRequest<BodyT, QueryT>
}

export type CreateContext = GrantContext<GrantRequestBody>

interface GrantContinueBody {
  interact_ref: string
}

interface GrantParams {
  id: string
}
export type ContinueContext = GrantContext<GrantContinueBody, GrantParams>

export type RevokeContext = GrantContext<null, GrantParams>

export interface GrantRoutes {
  create(ctx: CreateContext): Promise<void>
  continue(ctx: ContinueContext): Promise<void>
  revoke(ctx: RevokeContext): Promise<void>
}

export function createGrantRoutes({
  grantService,
  clientService,
  accessTokenService,
  accessService,
  interactionService,
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
    interactionService,
    logger: log,
    config
  }
  return {
    create: (ctx: CreateContext) => createGrant(deps, ctx),
    continue: (ctx: ContinueContext) => continueGrant(deps, ctx),
    revoke: (ctx: RevokeContext) => revokeGrant(deps, ctx)
  }
}

async function createGrant(
  deps: ServiceDependencies,
  ctx: CreateContext
): Promise<void> {
  let noInteractionRequired: boolean
  try {
    noInteractionRequired = canSkipInteraction(deps.config, ctx.request.body)
  } catch (err) {
    ctx.throw(400, 'identifier_required', { error: 'identifier_required' })
  }
  if (noInteractionRequired) {
    await createApprovedGrant(deps, ctx)
  } else {
    await createPendingGrant(deps, ctx)
  }
}

async function createApprovedGrant(
  deps: ServiceDependencies,
  ctx: CreateContext
): Promise<void> {
  const { body } = ctx.request
  const { grantService, config } = deps
  const trx = await Grant.startTransaction()
  let grant: Grant
  let accessToken: AccessToken
  try {
    grant = await grantService.create(body, trx)
    accessToken = await deps.accessTokenService.create(grant.id, trx)
    await trx.commit()
  } catch (err) {
    await trx.rollback()
    ctx.throw(500)
  }
  const access = await deps.accessService.getByGrant(grant.id)
  ctx.status = 200
  ctx.body = toOpenPaymentsGrant(
    grant,
    { authServerUrl: config.authServerDomain },
    accessToken,
    access
  )
}

async function createPendingGrant(
  deps: ServiceDependencies,
  ctx: CreateContext
): Promise<void> {
  const { body } = ctx.request
  const { grantService, interactionService, config } = deps
  if (!body.interact) {
    ctx.throw(400, 'interaction_required', { error: 'interaction_required' })
  }

  const client = await deps.clientService.get(body.client)
  if (!client) {
    ctx.throw(400, 'invalid_client', { error: 'invalid_client' })
  }

  const trx = await Grant.startTransaction()

  try {
    const grant = await grantService.create(body, trx)
    const interaction = await interactionService.create(grant.id, trx)
    await trx.commit()

    ctx.status = 200
    ctx.body = toOpenPaymentPendingGrant(grant, interaction, {
      client,
      authServerUrl: config.authServerDomain,
      waitTimeSeconds: config.waitTimeSeconds
    })
  } catch (err) {
    await trx.rollback()
    ctx.throw(500)
  }
}

function isMatchingContinueRequest(
  reqContinueId: string,
  reqContinueToken: string,
  grant: Grant
): boolean {
  return (
    reqContinueId === grant.continueId &&
    reqContinueToken === grant.continueToken
  )
}

function isContinuableGrant(grant: Grant): boolean {
  return !isRejectedGrant(grant) && !isRevokedGrant(grant)
}

/* 
  GNAP indicates that a grant may be continued even if it didn't require interaction.
  Rafiki only needs to continue a grant if it required an interaction, noninteractive grants immediately issue an access token without needing continuation
  so continuation only expects interactive grants to be continued.
*/
async function continueGrant(
  deps: ServiceDependencies,
  ctx: ContinueContext
): Promise<void> {
  const { id: continueId } = ctx.params
  const continueToken = (ctx.headers['authorization'] as string)?.split(
    'GNAP '
  )[1]
  const { interact_ref: interactRef } = ctx.request.body

  if (!continueId || !continueToken || !interactRef) {
    ctx.throw(401, { error: 'invalid_request' })
  }

  const {
    config,
    accessTokenService,
    grantService,
    accessService,
    interactionService
  } = deps

  const interaction = await interactionService.getByRef(interactRef)
  if (
    !interaction ||
    !isContinuableGrant(interaction.grant) ||
    !isMatchingContinueRequest(continueId, continueToken, interaction.grant)
  ) {
    ctx.throw(404, { error: 'unknown_request' })
  } else {
    const { grant } = interaction
    if (grant.state !== GrantState.Approved) {
      ctx.throw(401, { error: 'request_denied' })
    }

    const accessToken = await accessTokenService.create(grant.id)
    const access = await accessService.getByGrant(grant.id)
    await grantService.finalize(grant.id, GrantFinalization.Issued)

    // TODO: add "continue" to response if additional grant request steps are added
    ctx.body = toOpenPaymentsGrant(
      interaction.grant,
      { authServerUrl: config.authServerDomain },
      accessToken,
      access
    )
  }
}

async function revokeGrant(
  deps: ServiceDependencies,
  ctx: RevokeContext
): Promise<void> {
  const { id: continueId } = ctx.params
  const continueToken = (ctx.headers['authorization'] as string)?.split(
    'GNAP '
  )[1]
  if (!continueId || !continueToken) {
    ctx.throw(401, { error: 'invalid_request' })
  }
  const grant = await deps.grantService.getByContinue(continueId, continueToken)
  if (!grant) {
    ctx.throw(404, { error: 'unknown_request' })
  }

  const revoked = await deps.grantService.revokeGrant(grant.id)
  if (!revoked) {
    ctx.throw(404, { error: 'unknown_request' })
  }
  ctx.status = 204
}
