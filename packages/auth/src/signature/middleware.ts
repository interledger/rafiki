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
    ctx.throw(401, 'invalid signature input', {
      error: { code: 'invalid_request', description: 'invalid signature input' }
    })
  }

  const clientService = await ctx.container.use('clientService')
  const clientKey = await clientService.getKey({
    client,
    keyId
  })

  if (!clientKey) {
    ctx.throw(400, 'invalid client', {
      error: {
        code: 'invalid_client',
        description: 'could not determine client'
      }
    })
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
    ctx.throw(400, 'invalid signature headers', {
      error: {
        code: 'invalid_request',
        description: 'invalid signature headers'
      }
    })
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
    ctx.throw(401, 'invalid grant', {
      error: { code: 'invalid_continuation', description: 'invalid grant' }
    })
    return
  }

  const sigVerified = await verifySigFromClient(grant.client, ctx)
  if (!sigVerified) {
    ctx.throw(401, 'invalid signature', {
      error: { code: 'invalid_request', description: 'invalid signature' }
    })
  }
  await next()
}

export async function grantInitiationHttpsigMiddleware(
  ctx: CreateContext,
  next: () => Promise<any>
): Promise<void> {
  if (!validateSignatureHeaders(contextToRequestLike(ctx))) {
    ctx.throw(400, 'invalid signature headers', {
      error: {
        code: 'invalid_request',
        description: 'invalid signature headers'
      }
    })
  }

  const { body } = ctx.request

  const sigVerified = await verifySigFromClient(body.client, ctx)
  if (!sigVerified) {
    ctx.throw(401, 'invalid signature', {
      error: { code: 'invalid_request', description: 'invalid signature' }
    })
  }
  await next()
}

export async function tokenHttpsigMiddleware(
  ctx: AppContext,
  next: () => Promise<any>
): Promise<void> {
  if (!validateSignatureHeaders(contextToRequestLike(ctx))) {
    ctx.throw(400, 'invalid signature headers', {
      error: {
        code: 'invalid_request',
        description: 'invalid signature headers'
      }
    })
  }

  const accessTokenService = await ctx.container.use('accessTokenService')
  const accessToken = await accessTokenService.getByManagementId(
    ctx.params['id']
  )
  if (!accessToken) {
    ctx.throw(401, 'invalid access token', {
      error: { code: 'invalid_client', description: 'invalid access token' }
    })
    return
  }

  if (!accessToken.grant) {
    const logger = await ctx.container.use('logger')
    logger.error(
      `access token with management id ${ctx.params['id']} has no grant associated with it.`
    )
    ctx.throw(500, 'internal server error', {
      error: {
        code: 'internal_server_error',
        description: 'internal server error'
      }
    })
  }

  const sigVerified = await verifySigFromClient(accessToken.grant.client, ctx)
  if (!sigVerified) {
    ctx.throw(401, 'invalid signature', {
      error: { code: 'invalid_request', description: 'invalid signature' }
    })
  }

  ctx.accessToken = accessToken
  await next()
}
