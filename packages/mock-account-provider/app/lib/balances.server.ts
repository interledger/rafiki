import { mockAccounts } from './accounts.server'

export type AccountBalance = {
  paymentPointer: string
  balance: string
}

export async function getAccountBalances(): Promise<Array<AccountBalance>> {
  const accounts = await mockAccounts.listAll()
  return accounts.map((acc) => {
    return {
      paymentPointer: acc.paymentPointer,
      balance: (BigInt(acc.creditsPosted) - BigInt(acc.debitsPosted)).toString()
    }
  })
}
