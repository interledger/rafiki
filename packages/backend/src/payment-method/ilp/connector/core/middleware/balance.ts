import { Errors } from 'ilp-packet'
import { ILPContext, ILPMiddleware, TransferOptions } from '../rafiki'
import {
  isTransferError,
  TransferError
} from '../../../../../accounting/errors'
import { Transaction } from '../../../../../accounting/service'
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
      services.logger.error(
        {
          amount,
          destinationAmountOrError,
          sourceAsset: accounts.incoming.asset,
          destinationAsset: accounts.outgoing.asset
        },
        'Could not get rates'
      )
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
    const createPendingTransfer = async (): Promise<
      Transaction | undefined
    > => {
      const transferOptions = {
        sourceAccount: accounts.incoming,
        destinationAccount: accounts.outgoing,
        sourceAmount,
        destinationAmount: destinationAmountOrError,
        timeout: 5
      }
      const trxOrError =
        await services.accounting.createTransfer(transferOptions)

      if (isTransferError(trxOrError)) {
        const safeLogTransferError = (transferOptions: TransferOptions) => {
          if (transferOptions.destinationAccount?.http?.outgoing.authToken) {
            // @ts-expect-error - "The operand of a 'delete' operator must be optional"
            delete transferOptions.destinationAccount.http.outgoing.authToken
          }
          services.logger.error(
            { transferOptions },
            'Could not create transfer'
          )
        }

        switch (trxOrError) {
          case TransferError.InsufficientBalance:
          case TransferError.InsufficientLiquidity:
            safeLogTransferError(transferOptions)
            throw new InsufficientLiquidityError(trxOrError)
          default:
            safeLogTransferError(transferOptions)
            // TODO: map transfer errors to ILP errors
            ctxThrow(500, destinationAmountOrError.toString())
        }
      } else {
        return trxOrError
      }
    }

    if (state.streamDestination) {
      await next()
    }

    if (!state.streamDestination || response.fulfill) {
      // TODO: make this single-phase if streamDestination === true
      const trx = await createPendingTransfer()

      if (!state.streamDestination) {
        await next()
      }

      if (trx) {
        if (response.fulfill) {
          await trx.post()
        } else {
          await trx.void()
        }
      }
    }
  }
}
