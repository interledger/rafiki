import { Errors } from 'ilp-packet'
import { RafikiContext } from '../rafiki'
import { isTransferError } from '../../../accounts/types'

export function createBalanceMiddleware() {
  return async (
    { request, response, services, accounts }: RafikiContext,
    next: () => Promise<unknown>
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

    // Update balances on prepare
    const trxOrError = await services.accounts.transferFunds({
      sourceAccountId: accounts.incoming.accountId,
      destinationAccountId: accounts.outgoing.accountId,
      sourceAmount,
      destinationAmount: destinationAmountOrError
    })

    await next()

    if (!isTransferError(trxOrError)) {
      if (response.fulfill) {
        await trxOrError.commit()
      } else {
        await trxOrError.rollback()
      }
    }
  }
}
