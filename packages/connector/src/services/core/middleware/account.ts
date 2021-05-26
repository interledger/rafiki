import { Errors } from 'ilp-packet'
import { RafikiContext, RafikiMiddleware } from '../rafiki'
import { AuthState } from './auth'
import { IlpAccount } from '../services'

export function createAccountMiddleware(): RafikiMiddleware {
  return async function account(
    ctx: RafikiContext<AuthState>,
    next: () => Promise<unknown>
  ): Promise<void> {
    const incomingAccount = ctx.state.account
    ctx.assert(incomingAccount, 401)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (incomingAccount!.disabled) {
      throw new Errors.UnreachableError('source account is disabled')
    }

    const outgoingAccount = await ctx.services.accounts.getAccountByDestinationAddress(
      ctx.request.prepare.destination
    )
    if (outgoingAccount.disabled) {
      throw new Errors.UnreachableError('destination account is disabled')
    }

    ctx.accounts = {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      get incoming(): IlpAccount {
        return incomingAccount!
      },
      get outgoing(): IlpAccount {
        return outgoingAccount
      }
    }
    await next()
  }
}
