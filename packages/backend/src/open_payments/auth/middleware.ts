import {
  getKeyId,
  RequestLike,
  validateSignature
} from '@interledger/http-signature-utils'
import Koa from 'koa'
import { Limits, parseLimits } from '../payment/outgoing/limits'
import { HttpSigContext, PaymentPointerContext } from '../../app'
import { AccessAction, AccessType, JWKS } from '@interledger/open-payments'
import { TokenInfo } from '@interledger/token-introspection'
import { isActiveTokenInfo } from '@interledger/token-introspection'

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

export interface Access {
  type: string
  actions: AccessAction[]
  identifier?: string
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
      let tokenInfo: TokenInfo
      try {
        tokenInfo = await tokenIntrospectionClient.introspect({
          access_token: token
        })
      } catch (err) {
        ctx.throw(401, 'Invalid Token')
      }
      if (!isActiveTokenInfo(tokenInfo)) {
        ctx.throw(403, 'Inactive Token')
      }

      // TODO
      // https://github.com/interledger/rafiki/issues/835
      const access = tokenInfo.access.find((access: Access) => {
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
          ctx.accessAction = AccessAction.ReadAll
          return true
        }
        if (
          requestAction === AccessAction.List &&
          access.actions.includes(AccessAction.ListAll)
        ) {
          ctx.accessAction = AccessAction.ListAll
          return true
        }
        return access.actions.find((tokenAction: AccessAction) => {
          if (isActiveTokenInfo(tokenInfo) && tokenAction === requestAction) {
            ctx.accessAction = requestAction
            return true
          }
          return false
        })
      })

      if (!access) {
        ctx.throw(403, 'Insufficient Grant')
      }
      ctx.client = tokenInfo.client
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
      if (err && err['status'] === 401) {
        ctx.status = 401
        ctx.message = err['message']
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
  const keyId = getKeyId(ctx.request.headers['signature-input'])
  if (!keyId) {
    ctx.throw(401, 'Invalid signature input')
  }
  // TODO
  // cache client key(s)
  let jwks: JWKS | undefined
  try {
    const openPaymentsClient = await ctx.container.use('openPaymentsClient')
    jwks = await openPaymentsClient.paymentPointer.getKeys({
      url: ctx.client
    })
  } catch (error) {
    const logger = await ctx.container.use('logger')
    logger.debug(
      {
        error,
        client: ctx.client
      },
      'retrieving client key'
    )
  }
  const key = jwks?.keys.find((key) => key.kid === keyId)
  if (!key) {
    ctx.throw(401, 'Invalid signature input')
  }
  try {
    if (!(await validateSignature(key, contextToRequestLike(ctx)))) {
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
