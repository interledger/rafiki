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
    const incomingAccount = ctx.state.incomingAccount
    if (!incomingAccount) ctx.throw(401, 'unauthorized')
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (incomingAccount!.disabled) {
      throw new Errors.UnreachableError('source account is disabled')
    }

    const getAccountByDestinationAddress = async (): Promise<
      RafikiAccount | undefined
    > => {
      if (ctx.state.streamDestination) {
        const account = await accounts.get(ctx.state.streamDestination)
        return account
          ? {
              ...account,
              stream: {
                enabled: true
              }
            }
          : undefined
      }
      const address = ctx.request.prepare.destination
      const peer = await peers.getByDestinationAddress(address)
      if (peer) {
        return {
          ...peer.account,
          http: peer.http,
          maxPacketAmount: peer.maxPacketAmount,
          stream: {
            enabled: false
          }
        }
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
          const account = await accounts.get(accountId)
          return account
            ? {
                ...account,
                stream: {
                  enabled: true
                }
              }
            : undefined
        }
      }
    }

    const outgoingAccount = await getAccountByDestinationAddress()
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
