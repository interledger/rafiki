/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  validateSignature,
  validateSignatureHeaders,
  RequestLike
} from 'http-signature-utils'

import { AppContext } from '../app'
import { Grant } from '../grant/model'
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
  clientKeyId: string,
  ctx: AppContext
): Promise<boolean> {
  const clientService = await ctx.container.use('clientService')
  const clientKey = await clientService.getKey({
    client,
    keyId: clientKeyId
  })

  if (!clientKey) {
    ctx.throw(400, 'invalid client', { error: 'invalid_client' })
  }
  return validateSignature(clientKey, contextToRequestLike(ctx))
}

async function verifySigFromBoundKey(
  grant: Grant,
  ctx: AppContext
): Promise<boolean> {
  const sigInput = ctx.headers['signature-input'] as string
  ctx.clientKeyId = getSigInputKeyId(sigInput)
  if (ctx.clientKeyId !== grant.clientKeyId) {
    ctx.throw(401, 'invalid signature input', { error: 'invalid_request' })
  }

  return verifySigFromClient(grant.client, ctx.clientKeyId, ctx)
}

const KEY_ID_PREFIX = 'keyid="'

function getSigInputKeyId(sigInput: string): string | undefined {
  const keyIdParam = sigInput
    .split(';')
    .find((param) => param.startsWith(KEY_ID_PREFIX))
  // Trim prefix and quotes
  return keyIdParam?.slice(KEY_ID_PREFIX.length, -1)
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

  const sigVerified = await verifySigFromBoundKey(grant, ctx)
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

  const sigInput = ctx.headers['signature-input'] as string
  const clientKeyId = getSigInputKeyId(sigInput)
  if (!clientKeyId) {
    ctx.throw(401, 'invalid signature input', { error: 'invalid_request' })
  }
  ctx.clientKeyId = clientKeyId

  const sigVerified = await verifySigFromClient(
    body.client,
    ctx.clientKeyId,
    ctx
  )
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
      `access token with management id ${ctx.params['id']} has not grant associated with it.`
    )
    ctx.throw(500, 'internal server error', { error: 'internal_server_error' })
  }

  const sigVerified = await verifySigFromBoundKey(accessToken.grant, ctx)
  if (!sigVerified) {
    ctx.throw(401, 'invalid signature')
  }
  await next()
}
