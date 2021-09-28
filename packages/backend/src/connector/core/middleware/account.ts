import { Errors } from 'ilp-packet'
import { RafikiAccount, RafikiContext, RafikiMiddleware } from '../rafiki'
import { AuthState } from './auth'
import { AccountNotFoundError } from '../errors'

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
      ? await accounts.get(ctx.state.streamDestination)
      : await accounts.getByDestinationAddress(ctx.request.prepare.destination)
    if (!outgoingAccount) {
      throw new AccountNotFoundError('')
    }
    if (outgoingAccount.disabled) {
      throw new Errors.UnreachableError('destination account is disabled')
    }

    ctx.accounts = {
      get incoming(): RafikiAccount {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return incomingAccount!
      },
      get outgoing(): RafikiAccount {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return outgoingAccount!
      }
    }
    await next()
  }
}
