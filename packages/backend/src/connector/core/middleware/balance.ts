import { Errors } from 'ilp-packet'
import { ILPContext, ILPMiddleware } from '../rafiki'
import { isTransferError, TransferError } from '../../../accounting/errors'
const { CannotReceiveError, InsufficientLiquidityError } = Errors

export function createBalanceMiddleware(): ILPMiddleware {
  return async (
    {
      request,
      response,
      services,
      accounts,
      state,
      throw: ctxThrow
    }: ILPContext,
    next: () => Promise<void>
  ): Promise<void> => {
    const { amount } = request.prepare

    // Ignore zero amount packets
    if (amount === '0') {
      await next()
      return
    }

    const sourceAmount = BigInt(amount)
    const destinationAmountOrError = await services.rates.convert({
      sourceAmount,
      sourceAsset: accounts.incoming.asset,
      destinationAsset: accounts.outgoing.asset
    })
    if (typeof destinationAmountOrError !== 'bigint') {
      // ConvertError
      throw new CannotReceiveError(
        `Exchange rate error: ${destinationAmountOrError}`
      )
    }

    request.prepare.amount = destinationAmountOrError.toString()

    if (state.unfulfillable) {
      await next()
      return
    }

    // Update balances on prepare
    const trxOrError = await services.accounting.createTransfer({
      sourceAccount: accounts.incoming,
      destinationAccount: accounts.outgoing,
      sourceAmount,
      destinationAmount: destinationAmountOrError,
      timeout: BigInt(5e9) // 5 seconds
    })

    if (isTransferError(trxOrError)) {
      switch (trxOrError) {
        case TransferError.InsufficientBalance:
        case TransferError.InsufficientLiquidity:
          throw new InsufficientLiquidityError(trxOrError)
        default:
          // TODO: map transfer errors to ILP errors
          ctxThrow(500, destinationAmountOrError.toString())
      }
    } else {
      await next()

      if (response.fulfill) {
        await trxOrError.commit()
      } else {
        await trxOrError.rollback()
      }
    }
  }
}
