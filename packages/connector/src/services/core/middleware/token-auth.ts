import * as Koa from 'koa'
import { AuthState } from './auth'
import { TokenInfo, IntrospectFunction } from '../services/tokens'
import { verify } from 'jsonwebtoken'
import { RafikiMiddleware } from '../rafiki'

export interface TokenAuthState extends AuthState {
  token: string
  tokenInfo: TokenInfo
}

export interface TokenAuthConfig {
  introspect: IntrospectFunction
  authenticate: (tokenInfo: TokenInfo) => boolean
}

const defaultAuthenticate = (tokenInfo: TokenInfo): boolean => {
  return Boolean(tokenInfo.active && tokenInfo.sub)
}

const defaultIntrospect: IntrospectFunction = async (token: string) => {
  // TODO use an actual secret
  const decodedToken = verify(token, 'SECRET')
  // TODO Ensure token is actually TokenInfo
  return decodedToken as TokenInfo
}

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
 * Create authentication middleware based on a Bearer token and an introspection service.
 *
 * The context will implement `TokenAuthState` after being processed by this middleware
 *
 * @param config configuration options
 * @param config.introspect a function to introspect the token
 * @param config.authenticate a function to determine if the user is authenticated based on the introspected token
 */
export function createTokenAuthMiddleware(
  config?: Partial<TokenAuthConfig>
): RafikiMiddleware {
  const _auth =
    config && config.authenticate ? config.authenticate : defaultAuthenticate
  const _introspect =
    config && config.introspect ? config.introspect : defaultIntrospect

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

    // Introspect token
    ctx.state.user = await _introspect(ctx.state.token)
    ctx.assert(_auth(ctx.state.user), 401, 'Access Denied - Invalid Token')

    await next()
  }
}
