import { AssetAccount } from './service'

const ASSET_ACCOUNTS_RESERVED = 8

export interface AccountId {
  id: string
  asset?: {
    unit: number
    account?: never
  }
}

interface AssetAccountId {
  id?: never
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

export function getAccountId(options: AccountIdOptions): bigint {
  if (isAssetAccount(options)) {
    return getAssetAccountId(options.asset.unit, options.asset.account)
  }
  return uuidToBigInt(options.id)
}

export function uuidToBigInt(id: string): bigint {
  return BigInt(`0x${id.replace(/-/g, '')}`)
}
