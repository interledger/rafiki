/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  getKeyId,
  validateSignature,
  validateSignatureHeaders,
  RequestLike
} from 'http-signature-utils'

import { AppContext } from '../app'
import { ContinueContext, CreateContext, DeleteContext } from '../grant/routes'

function contextToRequestLike(ctx: AppContext): RequestLike {
  return {
    url: ctx.href,
    method: ctx.method,
    headers: ctx.headers,
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
    ctx.throw(401, 'invalid signature input', { error: 'invalid_request' })
  }

  const clientService = await ctx.container.use('clientService')
  const clientKey = await clientService.getKey({
    client,
    keyId
  })

  if (!clientKey) {
    ctx.throw(400, 'invalid client', { error: 'invalid_client' })
  }
  return validateSignature(clientKey, contextToRequestLike(ctx))
}

export async function grantContinueHttpsigMiddleware(
  ctx: ContinueContext | DeleteContext,
  next: () => Promise<any>
): Promise<void> {
  if (
    !validateSignatureHeaders(contextToRequestLike(ctx)) ||
    !ctx.headers['authorization']
  ) {
    ctx.throw(400, 'invalid signature headers', { error: 'invalid_request' })
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
    continueToken,
    interactRef
  )
  if (!grant) {
    ctx.status = 401
    ctx.body = {
      error: 'invalid_continuation',
      message: 'invalid grant'
    }
    return
  }

  const sigVerified = await verifySigFromClient(grant.client, ctx)
  if (!sigVerified) {
    ctx.throw(401, 'invalid signature')
  }
  await next()
}

export async function grantInitiationHttpsigMiddleware(
  ctx: CreateContext,
  next: () => Promise<any>
): Promise<void> {
  if (!validateSignatureHeaders(contextToRequestLike(ctx))) {
    ctx.throw(400, 'invalid signature headers', { error: 'invalid_request' })
  }

  const { body } = ctx.request

  const sigVerified = await verifySigFromClient(body.client, ctx)
  if (!sigVerified) {
    ctx.throw(401, 'invalid signature')
  }
  await next()
}

export async function tokenHttpsigMiddleware(
  ctx: AppContext,
  next: () => Promise<any>
): Promise<void> {
  if (!validateSignatureHeaders(contextToRequestLike(ctx))) {
    ctx.throw(400, 'invalid signature headers', { error: 'invalid_request' })
  }

  const accessTokenService = await ctx.container.use('accessTokenService')
  const accessToken = await accessTokenService.getByManagementId(
    ctx.params['id']
  )
  if (!accessToken) {
    ctx.status = 401
    ctx.body = {
      error: 'invalid_client',
      message: 'invalid access token'
    }
    return
  }

  if (!accessToken.grant) {
    const logger = await ctx.container.use('logger')
    logger.error(
      `access token with management id ${ctx.params['id']} has no grant associated with it.`
    )
    ctx.throw(500, 'internal server error', { error: 'internal_server_error' })
  }

  const sigVerified = await verifySigFromClient(accessToken.grant.client, ctx)
  if (!sigVerified) {
    ctx.throw(401, 'invalid signature')
  }
  await next()
}
