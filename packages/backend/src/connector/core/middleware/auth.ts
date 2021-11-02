import * as Koa from 'koa'
import { HttpMiddleware } from '../rafiki'
import { RafikiAccount } from '../rafiki'

export interface AuthState {
  incomingAccount?: RafikiAccount
}

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
export function createTokenAuthMiddleware(): HttpMiddleware {
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

    const peer = await ctx.services.peers.getByIncomingToken(ctx.state.token)
    ctx.assert(peer, 401, 'Access Denied - Invalid Token')
    ctx.state.incomingAccount = {
      ...peer.account,
      maxPacketAmount: peer.maxPacketAmount,
      staticIlpAddress: peer.staticIlpAddress
    }

    await next()
  }
}
