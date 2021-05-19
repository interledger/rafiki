import { Errors } from 'ilp-packet'
import { RafikiContext, RafikiMiddleware } from '../rafiki'
import { AuthState } from './auth'
import { IlpAccount } from '../services'

/*
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
*/

export function createAccountMiddleware(
  //config: AccountMiddlewareOptions = defaultMiddlewareOptions
): RafikiMiddleware {
  /*
  const getIncomingAccountId =
    config && config.getIncomingAccountId
      ? config.getIncomingAccountId
      : defaultGetIncomingAccountId
  const getOutgoingAccountId =
    config && config.getOutgoingAccountId
      ? config.getOutgoingAccountId
      : defaultGetOutgoingAccountId
  */

  return async function account(
    ctx: RafikiContext<AuthState>,
    next: () => Promise<unknown>
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    //const incomingAccountId = ctx.state.user!.sub! // Waiting on Sir Anders (https://github.com/microsoft/TypeScript/pull/32695)
    const incomingAccount = ctx.state.account
    ctx.assert(incomingAccount, 401)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (incomingAccount!.disabled) {
      throw new Errors.UnreachableError('source account is disabled')
    }

    const outgoingAccount = await ctx.services.accounts.getAccountByDestinationAddress(ctx.request.prepare.destination)
    if (outgoingAccount.disabled) {
      throw new Errors.UnreachableError('destination account is disabled')
    }

    ctx.accounts = {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      get incoming(): IlpAccount { return incomingAccount! },
      get outgoing(): IlpAccount { return outgoingAccount }
    }
    await next()
    /*
    const incomingAccountId = await getIncomingAccountId(ctx)
    const outgoingAccountId = await getOutgoingAccountId(ctx)
    ctx.accounts = {
      get incoming(): string {
        return incomingAccountId
      },
      get outgoing(): string {
        return outgoingAccountId
      }
    }
    await next()
    */
  }
}
