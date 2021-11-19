import { AssetAccount, Balance } from './service'

const ASSET_ACCOUNTS_RESERVED = 32

export interface AccountId {
  id: string
  asBalance?: Balance
  asset?: {
    unit: number
    account?: never
  }
}

interface AssetAccountId {
  id?: never
  asBalance?: never
  asset: {
    unit: number
    account: AssetAccount
  }
}

export type AccountIdOptions = AccountId | AssetAccountId

const isAssetAccount = (o: AccountIdOptions): o is AssetAccountId =>
  !!o.asset?.account

function getAssetAccountId(unit: number, type: AssetAccount): bigint {
  return BigInt(unit * ASSET_ACCOUNTS_RESERVED + type)
}

function getBalanceId(accountId: string, type: Balance): bigint {
  return uuidToBigInt(accountId) + BigInt(type)
}

export function getAccountId(options: AccountIdOptions): bigint {
  if (isAssetAccount(options)) {
    return getAssetAccountId(options.asset.unit, options.asset.account)
  } else if (options.asBalance) {
    return getBalanceId(options.id, options.asBalance)
  }
  return uuidToBigInt(options.id)
}

export function uuidToBigInt(id: string): bigint {
  return BigInt(`0x${id.replace(/-/g, '')}`)
}
