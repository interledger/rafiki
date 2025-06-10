/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  getKeyId,
  validateSignature,
  validateSignatureHeaders,
  RequestLike
} from '@interledger/http-signature-utils'

import { AppContext } from '../app'
import { ContinueContext, CreateContext, RevokeContext } from '../grant/routes'
import { Config } from '../config/app'
import { GNAPErrorCode, GNAPServerRouteError } from '../shared/gnapErrors'

function contextToRequestLike(ctx: AppContext): RequestLike {
  const url =
    Config.env === 'autopeer'
      ? ctx.href.replace('http://', 'https://')
      : ctx.href
  return {
    url,
    method: ctx.method,
    headers: ctx.headers ? JSON.parse(JSON.stringify(ctx.headers)) : undefined,
    body: ctx.request.body ? JSON.stringify(ctx.request.body) : undefined
  }
}

async function verifySigFromClient(
  client: string,
  ctx: AppContext
): Promise<boolean> {
  const sigInput = ctx.headers['signature-input'] as string
  const keyId = getKeyId(sigInput)
  if (!keyId) {
    throw new GNAPServerRouteError(
      401,
      GNAPErrorCode.InvalidClient,
      'invalid signature input'
    )
  }

  const clientService = await ctx.container.use('clientService')
  const clientKey = await clientService.getKey({
    client,
    keyId
  })

  if (!clientKey) {
    throw new GNAPServerRouteError(
      400,
      GNAPErrorCode.InvalidClient,
      'could not determine client'
    )
  }
  return validateSignature(clientKey, contextToRequestLike(ctx))
}

export async function grantContinueHttpsigMiddleware(
  ctx: ContinueContext | RevokeContext,
  next: () => Promise<any>
): Promise<void> {
  if (
    !validateSignatureHeaders(contextToRequestLike(ctx)) ||
    !ctx.headers['authorization']
  ) {
    throw new GNAPServerRouteError(
      401,
      GNAPErrorCode.InvalidClient,
      'invalid signature headers'
    )
  }

  const continueToken = ctx.headers['authorization'].replace(
    'GNAP ',
    ''
  ) as string
  const interactRef = ctx.request.body?.interact_ref

  const logger = await ctx.container.use('logger')
  logger.info(
    {
      continueToken,
      interactRef,
      continueId: ctx.params['id']
    },
    'httpsig for continue'
  )

  const grantService = await ctx.container.use('grantService')
  const grant = await grantService.getByContinue(
    ctx.params['id'],
    continueToken
  )

  if (!grant) {
    throw new GNAPServerRouteError(
      401,
      GNAPErrorCode.InvalidContinuation,
      'invalid grant'
    )
  }

  const sigVerified = await verifySigFromClient(grant.client, ctx)
  if (!sigVerified) {
    throw new GNAPServerRouteError(
      401,
      GNAPErrorCode.InvalidClient,
      'invalid signature'
    )
  }
  await next()
}

export async function grantInitiationHttpsigMiddleware(
  ctx: CreateContext,
  next: () => Promise<any>
): Promise<void> {
  if (!validateSignatureHeaders(contextToRequestLike(ctx))) {
    throw new GNAPServerRouteError(
      401,
      GNAPErrorCode.InvalidClient,
      'invalid signature headers'
    )
  }

  const { body } = ctx.request

  const sigVerified = await verifySigFromClient(body.client, ctx)
  if (!sigVerified) {
    throw new GNAPServerRouteError(
      401,
      GNAPErrorCode.InvalidClient,
      'invalid signature'
    )
  }
  await next()
}

export async function tokenHttpsigMiddleware(
  ctx: AppContext,
  next: () => Promise<any>
): Promise<void> {
  if (!validateSignatureHeaders(contextToRequestLike(ctx))) {
    throw new GNAPServerRouteError(
      401,
      GNAPErrorCode.InvalidClient,
      'invalid signature headers'
    )
  }

  const accessTokenService = await ctx.container.use('accessTokenService')
  const accessToken = await accessTokenService.getByManagementId(
    ctx.params['id']
  )
  if (!accessToken) {
    throw new GNAPServerRouteError(
      401,
      GNAPErrorCode.InvalidClient,
      'invalid access token'
    )
  }

  if (!accessToken.grant) {
    const logger = await ctx.container.use('logger')
    logger.error(
      `access token with management id ${ctx.params['id']} has no grant associated with it.`
    )
    throw new GNAPServerRouteError(
      500,
      GNAPErrorCode.RequestDenied,
      'internal server error'
    )
  }

  const sigVerified = await verifySigFromClient(accessToken.grant.client, ctx)
  if (!sigVerified) {
    throw new GNAPServerRouteError(
      401,
      GNAPErrorCode.InvalidClient,
      'invalid signature'
    )
  }

  ctx.accessToken = accessToken
  await next()
}
