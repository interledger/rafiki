import { RafikiContext } from '../rafiki'
import { Transaction } from '../services/accounts'

export function createIncomingBalanceMiddleware() {
  return async (
    { request, response, services, accounts }: RafikiContext,
    next: () => Promise<any>
  ): Promise<void> => {
    const { amount } = request.prepare

    // Ignore zero amount packets
    if (amount === '0') {
      await next()
      return
    }

    const account = await accounts.incoming

    if (!account) {
      throw new Error('Account not found')
    }

    // Increase balance on prepare
    await services.accounts.adjustBalanceReceivable(
      BigInt(amount),
      account.id,
      async (trx: Transaction) => {
        await next()

        if (response.fulfill) {
          await trx.commit()
        } else {
          await trx.rollback()
        }
      }
    )
  }
}

export function createOutgoingBalanceMiddleware() {
  return async (
    { request, response, services, accounts }: RafikiContext,
    next: () => Promise<any>
  ): Promise<void> => {
    const { amount } = request.prepare

    // Ignore zero amount packets
    if (amount === '0') {
      await next()
      return
    }

    const account = await accounts.outgoing

    if (!account) {
      throw new Error('Account not found')
    }

    await services.accounts.adjustBalancePayable(
      BigInt(amount),
      account.id,
      async (trx: Transaction) => {
        await next()

        if (response.fulfill) {
          await trx.commit()
        } else {
          await trx.rollback()
        }
      }
    )
  }
}
