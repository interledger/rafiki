import { RequestLike, validateSignature } from 'http-signature-utils'
import Koa from 'koa'
import { Limits, parseLimits } from '../payment/outgoing/limits'
import { HttpSigContext, PaymentPointerContext } from '../../app'
import { AccessAction, AccessType } from 'open-payments'

export type RequestAction = Exclude<AccessAction, 'read-all' | 'list-all'>
export const RequestAction: Record<string, RequestAction> = Object.freeze({
  Create: 'create',
  Read: 'read',
  Complete: 'complete',
  List: 'list'
})

export interface Grant {
  id: string
  limits?: Limits
}

function contextToRequestLike(ctx: HttpSigContext): RequestLike {
  return {
    url: ctx.href,
    method: ctx.method,
    headers: ctx.headers,
    body: ctx.request.body ? JSON.stringify(ctx.request.body) : undefined
  }
}
export function createTokenIntrospectionMiddleware({
  requestType,
  requestAction
}: {
  requestType: AccessType
  requestAction: RequestAction
}) {
  return async (
    ctx: PaymentPointerContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    const config = await ctx.container.use('config')
    try {
      const parts = ctx.request.headers.authorization?.split(' ')
      if (parts?.length !== 2 || parts[0] !== 'GNAP') {
        ctx.throw(401, 'Unauthorized')
      }
      const token = parts[1]
      const tokenIntrospectionClient = await ctx.container.use(
        'tokenIntrospectionClient'
      )
      const tokenInfo = await tokenIntrospectionClient.introspect(token)
      if (!tokenInfo) {
        ctx.throw(401, 'Invalid Token')
      }
      // TODO
      // https://github.com/interledger/rafiki/issues/835
      const access = tokenInfo.access.find((access) => {
        if (
          access.type !== requestType ||
          (access.identifier && access.identifier !== ctx.paymentPointer.url)
        ) {
          return false
        }
        if (
          requestAction === AccessAction.Read &&
          access.actions.includes(AccessAction.ReadAll)
        ) {
          return true
        }
        if (
          requestAction === AccessAction.List &&
          access.actions.includes(AccessAction.ListAll)
        ) {
          return true
        }
        return access.actions.find((tokenAction) => {
          if (tokenAction === requestAction) {
            // Unless the relevant token action is ReadAll/ListAll add the
            // clientId to ctx for Read/List filtering
            ctx.clientId = tokenInfo.client_id
            return true
          }
          return false
        })
      })

      if (!access) {
        ctx.throw(403, 'Insufficient Grant')
      }
      ctx.clientKey = tokenInfo.key.jwk
      if (
        requestType === AccessType.OutgoingPayment &&
        requestAction === AccessAction.Create
      ) {
        ctx.grant = {
          id: tokenInfo.grant,
          limits: access['limits'] ? parseLimits(access['limits']) : undefined
        }
      }
      await next()
    } catch (err) {
      if (err.status === 401) {
        ctx.status = 401
        ctx.message = err.message
        ctx.set('WWW-Authenticate', `GNAP as_uri=${config.authServerGrantUrl}`)
      } else {
        throw err
      }
    }
  }
}

export const httpsigMiddleware = async (
  ctx: HttpSigContext,
  next: () => Promise<unknown>
): Promise<void> => {
  // TODO: look up client jwks.json
  // https://github.com/interledger/rafiki/issues/737
  if (!ctx.clientKey) {
    const logger = await ctx.container.use('logger')
    logger.warn(
      {
        grant: ctx.grant
      },
      'missing grant key'
    )
    ctx.throw(500)
  }
  try {
    if (!(await validateSignature(ctx.clientKey, contextToRequestLike(ctx)))) {
      ctx.throw(401, 'Invalid signature')
    }
  } catch (err) {
    if (err instanceof Koa.HttpError) {
      throw err
    }
    const logger = await ctx.container.use('logger')
    logger.warn(
      {
        err
      },
      'httpsig error'
    )
    ctx.throw(401, `Invalid signature`)
  }
  await next()
}
