/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  verifySigFromClient,
  validateHttpSigHeaders,
  HttpSigContext
} from 'http-signature-utils'

import { AppContext } from '../app'
import { Grant } from '../grant/model'

async function verifySigFromBoundKey(
  grant: Grant,
  ctx: HttpSigContext
): Promise<boolean> {
  const sigInput = ctx.headers['signature-input'] as string
  ctx.clientKeyId = getSigInputKeyId(sigInput)
  if (ctx.clientKeyId !== grant.clientKeyId) {
    ctx.throw(401, 'invalid signature input', { error: 'invalid_request' })
  }

  return verifySigFromClient(grant.client, ctx)
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
  ctx: AppContext,
  next: () => Promise<any>
): Promise<void> {
  if (!validateHttpSigHeaders(ctx)) {
    ctx.throw(400, 'invalid signature headers', { error: 'invalid_request' })
  }

  const continueToken = ctx.headers['authorization'].replace(
    'GNAP ',
    ''
  ) as string
  const { interact_ref: interactRef } = ctx.request.body

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
      error: 'invalid_interaction',
      message: 'invalid grant'
    }
    return
  }

  await verifySigFromBoundKey(grant, ctx)
  await next()
}

export async function grantInitiationHttpsigMiddleware(
  ctx: AppContext,
  next: () => Promise<any>
): Promise<void> {
  if (!validateHttpSigHeaders(ctx)) {
    ctx.throw(400, 'invalid signature headers', { error: 'invalid_request' })
  }

  const { body } = ctx.request

  const sigInput = ctx.headers['signature-input'] as string
  ctx.clientKeyId = getSigInputKeyId(sigInput)
  if (!ctx.clientKeyId) {
    ctx.throw(401, 'invalid signature input', { error: 'invalid_request' })
  }

  await verifySigFromClient(body.client, ctx)
  await next()
}

export async function tokenHttpsigMiddleware(
  ctx: AppContext,
  next: () => Promise<any>
): Promise<void> {
  if (!validateHttpSigHeaders(ctx)) {
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

  const grantService = await ctx.container.use('grantService')
  const grant = await grantService.get(accessToken.grantId)
  await verifySigFromBoundKey(grant, ctx)
  await next()
}
