import { Errors } from 'ilp-packet'
import {
  IncomingAccount,
  OutgoingAccount,
  ILPContext,
  ILPMiddleware
} from '../rafiki'
import { AuthState } from './auth'
import { validateId } from '../../../shared/utils'
import { IncomingPaymentState } from '../../../open_payments/payment/incoming/model'

const UUID_LENGTH = 36

export function createAccountMiddleware(serverAddress: string): ILPMiddleware {
  return async function account(
    ctx: ILPContext<AuthState & { streamDestination?: string }>,
    next: () => Promise<void>
  ): Promise<void> {
    const { accounts, incomingPayments, peers } = ctx.services
    const incomingAccount = ctx.state.incomingAccount
    if (!incomingAccount) ctx.throw(401, 'unauthorized')

    const getAccountByDestinationAddress = async (): Promise<
      OutgoingAccount | undefined
    > => {
      if (ctx.state.streamDestination) {
        const incomingPayment = await incomingPayments.get(
          ctx.state.streamDestination
        )
        if (incomingPayment) {
          if (
            incomingPayment.state === IncomingPaymentState.Completed ||
            incomingPayment.state === IncomingPaymentState.Expired
          ) {
            throw new Errors.UnreachableError('destination account is disabled')
          }
          return incomingPayment
        }
        // Open Payments SPSP fallback account
        return await accounts.get(ctx.state.streamDestination)
      }
      const address = ctx.request.prepare.destination
      const peer = await peers.getByDestinationAddress(address)
      if (peer) {
        return peer
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
          // return await accounts.get(accountId)
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
