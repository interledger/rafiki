import { IlpAccount } from '../../models'

export interface AccountOptions {
  id: string
  disabled: boolean
}

export async function createAccount(
  account: AccountOptions
): Promise<IlpAccount> {
  return IlpAccount.query().insertAndFetch(account)
}

export async function getAccount(accountId: string): Promise<IlpAccount> {
  return IlpAccount.query().findById(accountId)
}
