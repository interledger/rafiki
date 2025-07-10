import {
    getKeyId,
    validateSignature,
    validateSignatureHeaders,
    RequestLike
  } from '@interledger/http-signature-utils'

  import { AppContext } from '../app'

function contextToRequestLike(ctx: AppContext): RequestLike {
    
    return {
      url: ctx.href,
      method: ctx.method,
      headers: ctx.headers ? JSON.parse(JSON.stringify(ctx.headers)) : undefined,
      body: ctx.request.body ? JSON.stringify(ctx.request.body) : undefined
    }
  }

export async function validatePosSignatureMiddleware(
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