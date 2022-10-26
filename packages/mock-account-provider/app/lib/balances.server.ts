import { mockAccounts } from './accounts.server'

export type AccountWithBalance = {
  id: string
  name: string
  paymentPointerID: string
  paymentPointer: string
  balance: string
}

export async function getAccountsWithBalance(): Promise<
  Array<AccountWithBalance>
> {
  const accounts = await mockAccounts.listAll()
  return accounts.map((acc) => {
    return {
      id: acc.id,
      name: acc.name,
      paymentPointerID: acc.paymentPointerID,
      paymentPointer: acc.paymentPointer,
      balance: (BigInt(acc.creditsPosted) - BigInt(acc.debitsPosted)).toString()
    }
  })
}
