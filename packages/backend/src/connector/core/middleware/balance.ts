import assert from 'assert'
import { Errors } from 'ilp-packet'
import { ILPContext, ILPMiddleware } from '../rafiki'
import {
  isAccountTransferError,
  AccountTransferError
} from '../../../tigerbeetle/account/errors'
const { AmountTooLargeError, InsufficientLiquidityError } = Errors

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
      throw new Errors.CannotReceiveError(
        `Exchange rate error: ${destinationAmountOrError}`
      )
    }

    request.prepare.amount = destinationAmountOrError.toString()

    // Update balances on prepare
    const trxOrError = await services.accounts.transferFunds({
      sourceAccount: accounts.incoming,
      destinationAccount: accounts.outgoing,
      sourceAmount,
      destinationAmount: destinationAmountOrError,
      timeout: BigInt(5e9) // 5 seconds
    })

    if (isAccountTransferError(trxOrError)) {
      switch (trxOrError) {
        case AccountTransferError.InsufficientBalance:
        case AccountTransferError.InsufficientLiquidity:
          throw new InsufficientLiquidityError(trxOrError)
        case AccountTransferError.ReceiveLimitExceeded: {
          const receivedAmount = destinationAmountOrError.toString()
          assert.ok(accounts.outgoing.id)
          const receiveLimit = await services.accounts.getReceiveLimit(
            accounts.outgoing.id
          )
          assert.ok(receiveLimit !== undefined)
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
          // TODO: map transfer errors to ILP errors or throw from transferFunds
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
