import { validateId } from '../../shared/utils'

export type AccountId = string | number | bigint
export type AccountUserData128 = AccountId

export function toTigerbeetleId(id: AccountId): bigint {
  if (typeof id === 'number') {
    return BigInt(id)
  }
  if (typeof id === 'bigint') {
    return id
  }
  if (!validateId(id)) {
    throw new Error('wrong format of id')
  }

  return uuidToBigInt(id)
}

export function uuidToBigInt(id: string): bigint {
  return BigInt(`0x${id.replace(/-/g, '')}`)
}
