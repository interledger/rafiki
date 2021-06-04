import { Errors } from 'ilp-packet'
import { RafikiContext, RafikiMiddleware } from '../rafiki'
import { AuthState } from './auth'
import { AccountNotFoundError } from '../errors'
import { IlpAccount } from '../services'

export function createAccountMiddleware(): RafikiMiddleware {
  return async function account(
    ctx: RafikiContext<AuthState & { streamDestination?: string }>,
    next: () => Promise<unknown>
  ): Promise<void> {
    const { accounts } = ctx.services
    const incomingAccount = ctx.state.account
    ctx.assert(incomingAccount, 401)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (incomingAccount!.disabled) {
      throw new Errors.UnreachableError('source account is disabled')
    }

    const outgoingAccount = ctx.state.streamDestination
      ? await accounts.getAccount(ctx.state.streamDestination)
      : await accounts.getAccountByDestinationAddress(
          ctx.request.prepare.destination
        )
    if (outgoingAccount === null) {
      throw new AccountNotFoundError('')
    }
    if (outgoingAccount.disabled) {
      throw new Errors.UnreachableError('destination account is disabled')
    }

    ctx.accounts = {
      get incoming(): IlpAccount {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return incomingAccount!
      },
      get outgoing(): IlpAccount {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return outgoingAccount!
      }
    }
    await next()
  }
}
