import { ParsedUrlQuery } from 'querystring'

import { AppContext } from '../app'
import { GrantService, GrantRequest as GrantRequestBody } from './service'
import {
  Grant,
  GrantFinalization,
  GrantState,
  toOpenPaymentPendingGrant,
  toOpenPaymentsGrant
} from './model'
import { ClientService } from '../client/service'
import { BaseService } from '../shared/baseService'
import {
  isIncomingPaymentAccessRequest,
  isQuoteAccessRequest
} from '../access/types'
import { IAppConfig } from '../config/app'
import { AccessTokenService } from '../accessToken/service'
import { AccessService } from '../access/service'
import { AccessToken } from '../accessToken/model'

interface ServiceDependencies extends BaseService {
  grantService: GrantService
  clientService: ClientService
  accessTokenService: AccessTokenService
  accessService: AccessService
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
    create: (ctx: CreateContext) => createGrant(deps, ctx),
    continue: (ctx: ContinueContext) => continueGrant(deps, ctx),
    revoke: (ctx: RevokeContext) => revokeGrant(deps, ctx)
  }
}

async function createGrant(
  deps: ServiceDependencies,
  ctx: CreateContext
): Promise<void> {
  if (canSkipInteraction(deps, ctx)) {
    await createApprovedGrant(deps, ctx)
  } else {
    await createPendingGrant(deps, ctx)
  }
}

function canSkipInteraction(
  deps: ServiceDependencies,
  ctx: CreateContext
): boolean {
  return ctx.request.body.access_token.access.every(
    (access) =>
      (isIncomingPaymentAccessRequest(access) &&
        !deps.config.incomingPaymentInteraction) ||
      (isQuoteAccessRequest(access) && !deps.config.quoteInteraction)
  )
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
  const { grantService, config } = deps
  if (!body.interact) {
    ctx.throw(400, { error: 'interaction_required' })
  }

  const client = await deps.clientService.get(body.client)
  if (!client) {
    ctx.throw(400, 'invalid_client', { error: 'invalid_client' })
  }

  const grant = await grantService.create(body)
  ctx.status = 200
  ctx.body = toOpenPaymentPendingGrant(grant, {
    client,
    authServerUrl: config.authServerDomain,
    waitTimeSeconds: config.waitTimeSeconds
  })
}

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

  const { config, accessTokenService, grantService, accessService } = deps
  const grant = await grantService.getByContinue(continueId, continueToken, {
    interactRef
  })
  if (!grant) {
    ctx.throw(404, { error: 'unknown_request' })
  } else {
    if (grant.state !== GrantState.Approved) {
      ctx.throw(401, { error: 'request_denied' })
    }

    const accessToken = await accessTokenService.create(grant.id)
    const access = await accessService.getByGrant(grant.id)
    await grantService.finalize(grant.id, GrantFinalization.Issued)

    // TODO: add "continue" to response if additional grant request steps are added
    ctx.body = toOpenPaymentsGrant(
      grant,
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
