import { Errors } from 'ilp-packet'
import { RafikiAccount, ILPContext, ILPMiddleware } from '../rafiki'
import { AuthState } from './auth'
import { AccountNotFoundError } from '../errors'
import { validateId } from '../../../shared/utils'

const UUID_LENGTH = 36

export function createAccountMiddleware(serverAddress: string): ILPMiddleware {
  return async function account(
    ctx: ILPContext<AuthState & { streamDestination?: string }>,
    next: () => Promise<void>
  ): Promise<void> {
    const { accounts, peers } = ctx.services
    const incomingAccount = ctx.state.account
    if (!incomingAccount) ctx.throw(401, 'unauthorized')
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (incomingAccount!.disabled) {
      throw new Errors.UnreachableError('source account is disabled')
    }

    const getAccountByDestinationAddress = async (
      address: string
    ): Promise<RafikiAccount | undefined> => {
      const peer = await peers.getByDestinationAddress(address)
      if (peer) {
        return peer.account
      }
      if (
        address.startsWith(serverAddress + '.') &&
        (address.length === serverAddress.length + 1 + UUID_LENGTH ||
          address[serverAddress.length + 1 + UUID_LENGTH] === '.')
      ) {
        const accountId = address.slice(
          serverAddress.length + 1,
          serverAddress.length + 1 + UUID_LENGTH
        )
        if (validateId(accountId)) {
          return await accounts.get(accountId)
        }
      }
    }

    const outgoingAccount = ctx.state.streamDestination
      ? await accounts.get(ctx.state.streamDestination)
      : await getAccountByDestinationAddress(ctx.request.prepare.destination)
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
