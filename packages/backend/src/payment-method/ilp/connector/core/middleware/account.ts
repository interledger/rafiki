import { Errors } from 'ilp-packet'
import { AccountAlreadyExistsError } from '../../../../../accounting/errors'
import { LiquidityAccountType } from '../../../../../accounting/service'
import { IncomingPaymentState } from '../../../../../open_payments/payment/incoming/model'
import {
  ILPContext,
  ILPMiddleware,
  IncomingAccount,
  OutgoingAccount
} from '../rafiki'
import { AuthState } from './auth'
import { StreamState } from './stream-address'

export function createAccountMiddleware(): ILPMiddleware {
  return async function account(
    ctx: ILPContext<AuthState & StreamState>,
    next: () => Promise<void>
  ): Promise<void> {
    const createLiquidityAccount = async (
      account: IncomingAccount,
      accountType: LiquidityAccountType
    ): Promise<void> => {
      try {
        await ctx.services.accounting.createLiquidityAccount(
          account,
          accountType
        )
        ctx.services.logger.debug(
          { account, accountType },
          'Created liquidity account'
        )
      } catch (err) {
        // Don't complain if liquidity account already exists.
        if (!(err instanceof AccountAlreadyExistsError)) {
          ctx.services.logger.error(
            { account, accountType, err },
            'Failed to create liquidity account'
          )
          throw err
        }
      }
    }

    const { walletAddresses, incomingPayments, peers } = ctx.services
    const incomingAccount = ctx.state.incomingAccount
    if (!incomingAccount) {
      ctx.services.logger.error(
        { state: ctx.state },
        'Unauthorized: No incoming account'
      )
      ctx.throw(401, 'unauthorized')
    }

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
            const errorMessage = 'destination account is in an incorrect state'
            ctx.services.logger.error(
              {
                incomingPayment,
                streamDestination: ctx.state.streamDestination
              },
              errorMessage
            )
            throw new Errors.UnreachableError(errorMessage)
          }

          // Create the tigerbeetle account if not exists.
          // The incoming payment state will be PENDING until payments are received.
          if (incomingPayment.state === IncomingPaymentState.Pending) {
            await createLiquidityAccount(
              incomingPayment,
              LiquidityAccountType.INCOMING
            )
          }
          return incomingPayment
        }
        // Open Payments SPSP fallback account
        const walletAddress = await walletAddresses.get(
          ctx.state.streamDestination
        )
        if (walletAddress) {
          if (!walletAddress.totalEventsAmount) {
            await createLiquidityAccount(
              walletAddress,
              LiquidityAccountType.WEB_MONETIZATION
            )
          }
          return walletAddress
        }
      }
      const address = ctx.request.prepare.destination
      const peer = await peers.getByDestinationAddress(
        address,
        incomingAccount.tenantId
      )
      if (peer) {
        return peer
      }
    }

    const outgoingAccount = await getAccountByDestinationAddress()
    if (!outgoingAccount) {
      const errorMessage = 'unknown destination account'
      ctx.services.logger.error(
        {
          streamDestination: ctx.state.streamDestination,
          destinationAddress: ctx.request.prepare.destination
        },
        errorMessage
      )
      throw new Errors.UnreachableError(errorMessage)
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
