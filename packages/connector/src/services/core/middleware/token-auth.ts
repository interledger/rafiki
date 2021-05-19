import * as Koa from 'koa'
import { RafikiMiddleware } from '../rafiki'

// TODO incomingTokens

export function getBearerToken(ctx: Koa.Context): string | undefined {
  if (!ctx.request.header || !ctx.request.header.authorization) {
    return
  }
  const parts = ctx.request.header.authorization.split(' ')
  if (parts.length === 2) {
    const scheme = parts[0]
    const credentials = parts[1]

    if (/^Bearer$/i.test(scheme)) {
      return credentials
    }
  }
}

/**
 * Create authentication middleware based on a Bearer token.
 *
 * The context will implement `AuthState` after being processed by this middleware
 */
export function createTokenAuthMiddleware(): RafikiMiddleware {
  return async function auth(
    ctx: Koa.Context,
    next: () => Promise<unknown>
  ): Promise<void> {
    // Parse out Bearer token
    ctx.state.token = getBearerToken(ctx)
    ctx.assert(
      ctx.state.token,
      401,
      'Bearer token required in Authorization header'
    )

    ctx.state.account = await ctx.accounts.getAccountByToken(ctx.state.token)
    ctx.assert(ctx.state.account, 401, 'Access Denied - Invalid Token')

    await next()
  }
}
