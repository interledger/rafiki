import { RafikiAccount } from '../rafiki'

export function accountToId(account: RafikiAccount): string {
  return account.id || `${account.asset.unit}|${account.asset.account}`
}
