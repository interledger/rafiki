import { RafikiContext, RafikiMiddleware } from '../rafiki'
import { AuthState } from './auth'

export interface AccountMiddlewareOptions {
  getIncomingAccountId?: (ctx: RafikiContext<AuthState>) => Promise<string>
  getOutgoingAccountId?: (ctx: RafikiContext) => Promise<string>
}

const defaultGetIncomingAccountId = async (
  ctx: RafikiContext<AuthState>
): Promise<string> => {
  const peer = await ctx.peers.incoming
  return peer.id
}

const defaultGetOutgoingAccountId = async (
  ctx: RafikiContext
): Promise<string> => {
  const peer = await ctx.peers.outgoing
  return peer.id
}

const defaultMiddlewareOptions: AccountMiddlewareOptions = {
  getIncomingAccountId: defaultGetIncomingAccountId,
  getOutgoingAccountId: defaultGetOutgoingAccountId
}

export function createAccountMiddleware(
  config: AccountMiddlewareOptions = defaultMiddlewareOptions
): RafikiMiddleware {
  const getIncomingAccountId =
    config && config.getIncomingAccountId
      ? config.getIncomingAccountId
      : defaultGetIncomingAccountId
  const getOutgoingAccountId =
    config && config.getOutgoingAccountId
      ? config.getOutgoingAccountId
      : defaultGetOutgoingAccountId

  return async function account(
    ctx: RafikiContext<AuthState>,
    next: () => Promise<unknown>
  ): Promise<void> {
    const incomingAccountId = await getIncomingAccountId(ctx)
    const outgoingAccountId = await getOutgoingAccountId(ctx)
    ctx.accounts = {
      get incomingId(): string {
        return incomingAccountId
      },
      get outgoingId(): string {
        return outgoingAccountId
      }
    }
    await next()
  }
}
