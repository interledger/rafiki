import { Errors } from 'ilp-packet'
import {
  IncomingAccount,
  OutgoingAccount,
  ILPContext,
  ILPMiddleware
} from '../rafiki'
import { AuthState } from './auth'
import { validateId } from '../../../shared/utils'

const UUID_LENGTH = 36

export function createAccountMiddleware(serverAddress: string): ILPMiddleware {
  return async function account(
    ctx: ILPContext<AuthState & { streamDestination?: string }>,
    next: () => Promise<void>
  ): Promise<void> {
    const { accounts, invoices, peers } = ctx.services
    const incomingAccount = ctx.state.incomingAccount
    if (!incomingAccount) ctx.throw(401, 'unauthorized')

    const getAccountByDestinationAddress = async (): Promise<
      OutgoingAccount | undefined
    > => {
      if (ctx.state.streamDestination) {
        const invoice = await invoices.get(ctx.state.streamDestination)
        if (invoice) {
          if (!invoice.active) {
            throw new Errors.UnreachableError('destination account is disabled')
          }
          return {
            id: invoice.id,
            asset: invoice.account.asset,
            stream: {
              enabled: true
            }
          }
        }
        // Open Payments SPSP fallback account
        const spspAccount = await accounts.get(ctx.state.streamDestination)
        if (spspAccount) {
          return {
            id: spspAccount.id,
            asset: spspAccount.asset,
            stream: {
              enabled: true
            }
          }
        }
        return undefined
      }
      const address = ctx.request.prepare.destination
      const peer = await peers.getByDestinationAddress(address)
      if (peer) {
        return {
          ...peer,
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
          // TODO: Look up direct ILP access account
          // const account = await accounts.get(accountId)
          // return account
          //   ? {
          //       // TODO: this is missing asset code and scale
          //       ...account,
          //       stream: {
          //         enabled: true
          //       }
          //     }
          //   : undefined
        }
      }
    }

    const outgoingAccount = await getAccountByDestinationAddress()
    if (!outgoingAccount) {
      throw new Errors.UnreachableError('unknown destination account')
    }
    ctx.accounts = {
      get incoming(): IncomingAccount {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return incomingAccount!
      },
      get outgoing(): OutgoingAccount {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return outgoingAccount!
      }
    }
    await next()
  }
}
