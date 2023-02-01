import { Errors } from 'ilp-packet'
import { CreateAccountError } from '../../../accounting/errors'
import { areAllAccountExistsErrors } from '../../../accounting/tigerbeetle/errors'
import { IncomingPaymentState } from '../../../open_payments/payment/incoming/model'
import { validateId } from '../../../shared/utils'
import {
  ILPContext,
  ILPMiddleware,
  IncomingAccount,
  OutgoingAccount
} from '../rafiki'
import { AuthState } from './auth'

const UUID_LENGTH = 36

export function createAccountMiddleware(serverAddress: string): ILPMiddleware {
  return async function account(
    ctx: ILPContext<AuthState & { streamDestination?: string }>,
    next: () => Promise<void>
  ): Promise<void> {
    const createLiquidityAccount = async (
      account: IncomingAccount
    ): Promise<void> => {
      try {
        await ctx.services.accounting.createLiquidityAccount(account)
      } catch (err) {
        // Don't complain if liquidity account already exists.
        if (
          err instanceof CreateAccountError &&
          areAllAccountExistsErrors([err.code])
        ) {
          // Do nothing.
        } else {
          throw err
        }
      }
    }

    const { paymentPointers, incomingPayments, peers } = ctx.services
    const incomingAccount = ctx.state.incomingAccount
    if (!incomingAccount) ctx.throw(401, 'unauthorized')

    const getAccountByDestinationAddress = async (): Promise<
      OutgoingAccount | undefined
    > => {
      if (ctx.state.streamDestination) {
        const incomingPayment = await incomingPayments.get({
          id: ctx.state.streamDestination
        })
        if (incomingPayment) {
          if (
            ctx.request.prepare.amount !== '0' &&
            [
              IncomingPaymentState.Completed,
              IncomingPaymentState.Expired
            ].includes(incomingPayment.state)
          ) {
            throw new Errors.UnreachableError('destination account is disabled')
          }

          // Create the tigerbeetle account if not exists.
          // The incoming payment state will be PENDING until payments are received.
          if (incomingPayment.state === IncomingPaymentState.Pending) {
            await createLiquidityAccount(incomingPayment)
          }
          return incomingPayment
        }
        // Open Payments SPSP fallback account
        const paymentPointer = await paymentPointers.get(
          ctx.state.streamDestination
        )
        if (paymentPointer) {
          if (!paymentPointer.totalEventsAmount) {
            await createLiquidityAccount(paymentPointer)
          }
          return paymentPointer
        }
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
