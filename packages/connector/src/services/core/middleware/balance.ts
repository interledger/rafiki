import { RafikiContext } from '../rafiki'

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

    // Update balances on prepare
    const trx = await services.accounts.transferFunds({
      sourceAccountId: accounts.incoming.accountId,
      destinationAccountId: accounts.outgoing.accountId,
      sourceAmount: BigInt(amount)
    })

    await next()

    if (response.fulfill) {
      await trx.commit()
    } else {
      await trx.rollback()
    }
  }
}
