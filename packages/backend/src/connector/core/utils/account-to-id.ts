import { IncomingAccount, OutgoingAccount } from '../rafiki'

export function accountToId(
  account: IncomingAccount | OutgoingAccount
): string {
  return account.id || `${account.asset.unit}|${account.asset.account}`
}
