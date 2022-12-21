import { RequestLike, validateSignature } from 'http-signature-utils'
import Koa from 'koa'
import { AccessType, AccessAction } from './grant'
import { parseLimits } from '../payment/outgoing/limits'
import { HttpSigContext, PaymentPointerContext } from '../../app'

function contextToRequestLike(ctx: HttpSigContext): RequestLike {
  return {
    url: ctx.href,
    method: ctx.method,
    headers: ctx.headers,
    body: ctx.request.body ? JSON.stringify(ctx.request.body) : undefined
  }
}
export function createTokenIntrospectionMiddleware({
  type,
  action
}: {
  type: AccessType
  action: AccessAction
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
      if (
        process.env.NODE_ENV !== 'production' &&
        token === config.devAccessToken
      ) {
        await next()
        return
      }
      const authService = await ctx.container.use('authService')
      const tokenInfo = await authService.introspect(token)
      if (!tokenInfo) {
        ctx.throw(401, 'Invalid Token')
      }
      // TODO
      // https://github.com/interledger/rafiki/issues/835
      const access = tokenInfo.access.find(
        (access) =>
          access.type === type &&
          (!access.identifier ||
            access.identifier === ctx.paymentPointer.url) &&
          access.actions.find((tokenAction) => {
            if (tokenAction === action) {
              // Unless the relevant grant action is ReadAll/ListAll add the
              // clientId to ctx for Read/List filtering
              ctx.clientId = tokenInfo.client_id
              return true
            }
            return (
              (action === AccessAction.Read &&
                tokenAction === AccessAction.ReadAll) ||
              (action === AccessAction.List &&
                tokenAction === AccessAction.ListAll)
            )
          })
      )
      if (!access) {
        ctx.throw(403, 'Insufficient Grant')
      }
      ctx.clientKey = tokenInfo.key.jwk
      if (
        type === AccessType.OutgoingPayment &&
        action === AccessAction.Create
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
