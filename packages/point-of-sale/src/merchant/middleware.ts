/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  getKeyId,
  validateSignature,
  validateSignatureHeaders,
  RequestLike
} from '@interledger/http-signature-utils'

import { AppContext } from '../app'
import { CreateMerchantContext } from './routes'
import { POSMerchantRouteError, RouteErrorCode } from './errors'

function contextToRequestLike(ctx: AppContext): RequestLike {
  return {
    url: ctx.href,
    method: ctx.method,
    headers: ctx.headers ? JSON.parse(JSON.stringify(ctx.headers)) : undefined,
    body: ctx.request.body ? JSON.stringify(ctx.request.body) : undefined
  }
}

export async function validatePosSignatureMiddleware(
  ctx: CreateMerchantContext,
  next: () => Promise<any>
): Promise<void> {
  if (!validateSignatureHeaders(contextToRequestLike(ctx))) {
    throw new POSMerchantRouteError(
      401,
      'invalid signature headers',
      RouteErrorCode.InvalidClient
    )
  }

  const sigVerified = await verifySigFromClient(ctx)
  if (!sigVerified) {
    throw new POSMerchantRouteError(
      401,
      'invalid signature',
      RouteErrorCode.InvalidClient
    )
  }
  await next()
}

async function verifySigFromClient(ctx: AppContext): Promise<boolean> {
  const sigInput = ctx.headers['signature-input'] as string
  const keyId = getKeyId(sigInput)
  if (!keyId) {
    throw new POSMerchantRouteError(
      401,
      'invalid signature input',
      RouteErrorCode.InvalidClient
    )
  }

  const posService = await ctx.container.use('posService')
  const clientKey = await posService.getByKeyId({
    keyId
  })

  if (!clientKey) {
    throw new POSMerchantRouteError(
      400,
      'could not determine client',
      RouteErrorCode.InvalidClient
    )
  }
  return validateSignature(clientKey, contextToRequestLike(ctx))
}
