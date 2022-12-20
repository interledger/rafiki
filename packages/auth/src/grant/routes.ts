import * as crypto from 'crypto'
import { URL } from 'url'
import { ParsedUrlQuery } from 'querystring'

import { AppContext } from '../app'
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

type GrantRequest<BodyT = never, QueryT = ParsedUrlQuery> = Omit<
  AppContext['request'],
  'body'
> & {
  body: BodyT
  query: ParsedUrlQuery & QueryT
}

type GrantContext<BodyT = never, QueryT = ParsedUrlQuery> = Omit<
  AppContext,
  'request'
> & {
  request: GrantRequest<BodyT, QueryT>
  clientKeyId: string
}

export type CreateContext = GrantContext<GrantRequestBody>

interface GrantContinueBody {
  interact_ref: string
}

interface GrantParams {
  id: string
}
export type ContinueContext = GrantContext<GrantContinueBody, GrantParams>

export type DeleteContext = GrantContext<null, GrantParams>

type InteractionRequest<
  BodyT = never,
  QueryT = ParsedUrlQuery,
  ParamsT = { [key: string]: string }
> = Omit<AppContext['request'], 'body'> & {
  body: BodyT
  query: ParsedUrlQuery & QueryT
  params: ParamsT
}

type InteractionContext<QueryT, ParamsT> = Omit<AppContext, 'request'> & {
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

export interface GrantRoutes {
  create(ctx: CreateContext): Promise<void>
  // TODO: factor this out into separate routes service
  interaction: {
    start(ctx: StartContext): Promise<void>
    finish(ctx: FinishContext): Promise<void>
    acceptOrReject(ctx: ChooseContext): Promise<void>
    details(ctx: GetContext): Promise<void>
  }
  continue(ctx: ContinueContext): Promise<void>
  delete(ctx: DeleteContext): Promise<void>
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
    create: (ctx: CreateContext) => createGrantInitiation(deps, ctx),
    interaction: {
      start: (ctx: StartContext) => startInteraction(deps, ctx),
      finish: (ctx: FinishContext) => finishInteraction(deps, ctx),
      acceptOrReject: (ctx: ChooseContext) => handleGrantChoice(deps, ctx),
      details: (ctx: GetContext) => getGrantDetails(deps, ctx)
    },
    continue: (ctx: ContinueContext) => continueGrant(deps, ctx),
    delete: (ctx: DeleteContext) => deleteGrant(deps, ctx)
  }
}

async function createGrantInitiation(
  deps: ServiceDependencies,
  ctx: CreateContext
): Promise<void> {
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
      ctx.throw(500)
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
    ctx.throw(400, { error: 'interaction_required' })
  }

  const client = await deps.clientService.get(body.client)
  if (!client) {
    ctx.throw(400, 'invalid_client', { error: 'invalid_client' })
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

  if (!grant) {
    ctx.throw(401, { error: 'unknown_request' })
  }

  ctx.session.nonce = grant.interactNonce

  const interactionUrl = new URL(config.identityServerDomain)
  interactionUrl.searchParams.set('interactId', grant.interactId)
  interactionUrl.searchParams.set('nonce', grant.interactNonce)
  interactionUrl.searchParams.set('clientName', clientName as string)
  interactionUrl.searchParams.set('clientUri', clientUri as string)

  ctx.redirect(interactionUrl.toString())
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

  const grant = await grantService.getByInteractionSession(interactId, nonce)

  if (!grant) {
    ctx.throw(404, { error: 'unknown_request' })
  }

  if (
    grant.state === GrantState.Revoked ||
    grant.state === GrantState.Rejected
  ) {
    ctx.throw(401, { error: 'user_denied' })
  }

  if (grant.state === GrantState.Granted) {
    ctx.throw(400, { error: 'request_denied' })
  }

  if (choice === GrantChoices.Accept) {
    await grantService.issueGrant(grant.id)
  } else if (choice === GrantChoices.Reject) {
    await grantService.rejectGrant(grant.id)
  } else {
    ctx.throw(404)
  }

  ctx.status = 202
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
  const grant = await grantService.getByContinue(
    continueId,
    continueToken,
    interactRef
  )
  if (!grant) {
    ctx.throw(404, { error: 'unknown_request' })
  }

  if (grant.state !== GrantState.Granted) {
    ctx.throw(401, { error: 'request_denied' })
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
async function deleteGrant(
  deps: ServiceDependencies,
  ctx: ContinueContext
): Promise<void> {
  const { id: continueId } = ctx.params
  const deletion = await deps.grantService.deleteGrant(continueId)
  if (deletion === 0) {
    ctx.throw(404, { error: 'unknown_continue_id' })
  }
  ctx.status = 202
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
