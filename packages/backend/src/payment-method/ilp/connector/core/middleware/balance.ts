import { Errors } from 'ilp-packet'
import { ILPContext, ILPMiddleware } from '../rafiki'
import {
  isTransferError,
  TransferError
} from '../../../../../accounting/errors'
import { Transaction, TransferType } from '../../../../../accounting/service'
import { Config as AppConfig } from '../../../../../config/app'
import { isConvertError } from '../../../../../rates/service'
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
    const stopTimer = services.telemetry.startTimer('balance_middleware_next', {
      callName: 'balanceMiddleware:next'
    })
    const { amount } = request.prepare
    const logger = services.logger.child(
      { module: 'balance-middleware' },
      {
        redact: ['transferOptions.destinationAccount.http.outgoing.authToken']
      }
    )

    // Ignore zero amount packets
    if (amount === '0') {
      await next()
      stopTimer()
      return
    }

    const sourceAmount = BigInt(amount)
    const destinationAmountOrError = await services.rates.convertSource(
      {
        sourceAmount,
        sourceAsset: accounts.incoming.asset,
        destinationAsset: accounts.outgoing.asset
      },
      accounts.outgoing.tenantId
    )
    if (isConvertError(destinationAmountOrError)) {
      logger.error(
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
    const { amount: destinationAmount } = destinationAmountOrError

    request.prepare.amount = destinationAmount.toString()

    if (state.unfulfillable) {
      await next()
      stopTimer()
      return
    }

    // Update balances on prepare:
    const createPendingTransfer = async (): Promise<
      Transaction | undefined
    > => {
      const transferOptions = {
        sourceAccount: accounts.incoming,
        destinationAccount: accounts.outgoing,
        sourceAmount,
        destinationAmount,
        transferType: TransferType.TRANSFER,
        timeout: AppConfig.tigerBeetleTwoPhaseTimeout
      }
      const trxOrError =
        await services.accounting.createTransfer(transferOptions)
      if (isTransferError(trxOrError)) {
        logger.error(
          { transferOptions, transferError: trxOrError },
          'Could not create transfer'
        )
        switch (trxOrError) {
          case TransferError.InsufficientBalance:
          case TransferError.InsufficientLiquidity:
            throw new InsufficientLiquidityError(trxOrError)
          default:
            // TODO: map transfer errors to ILP errors
            ctxThrow(500, destinationAmountOrError.toString())
        }
      } else {
        stopTimer()
        return trxOrError
      }
    }

    if (state.streamDestination) {
      await next()
      stopTimer()
    }

    if (!state.streamDestination || response.fulfill) {
      // TODO: make this single-phase if streamDestination === true
      const trx = await createPendingTransfer()

      if (!state.streamDestination) {
        await next()
        stopTimer()
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
