import { validateId } from '../../shared/utils'

export type AccountId = string | number | bigint
export type AccountUserData128 = AccountId

export function toTigerBeetleId(id: AccountId): bigint {
  if (typeof id === 'number') return BigInt(id)
  else if (typeof id === 'bigint') return id
  else if (!validateId(id)) throw new Error('wrong format of id')
  return uuidToBigInt(id)
}

export function uuidToBigInt(id: string): bigint {
  return BigInt(`0x${id.replace(/-/g, '')}`)
}

export function hexTextToBigInt(hex: string): bigint {
  return BigInt(`0x${hex}`)
}
