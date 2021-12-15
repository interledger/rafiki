import assert from 'assert'
import { Errors } from 'ilp-packet'
import { ILPContext, ILPMiddleware } from '../rafiki'
import { isTransferError, TransferError } from '../../../accounting/errors'
const {
  AmountTooLargeError,
  CannotReceiveError,
  InsufficientLiquidityError
} = Errors

export function createBalanceMiddleware(): ILPMiddleware {
  return async (
    { request, response, services, accounts, throw: ctxThrow }: ILPContext,
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

    // Update balances on prepare
    const trxOrError = await services.accounting.sendAndReceive({
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
        case TransferError.ReceiveLimitExceeded: {
          const receivedAmount = destinationAmountOrError.toString()
          const receiveLimit = await services.invoices.getReceiveLimit(
            accounts.outgoing.id
          )
          assert.ok(receiveLimit !== undefined)
          if (receiveLimit === BigInt(0)) {
            throw new CannotReceiveError('receive limit already reached')
          }
          const maximumAmount = receiveLimit.toString()
          throw new AmountTooLargeError(
            `amount too large. maxAmount=${maximumAmount} actualAmount=${receivedAmount}`,
            {
              receivedAmount,
              maximumAmount
            }
          )
        }
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
