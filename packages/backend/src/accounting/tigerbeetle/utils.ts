import { validateId } from '../../shared/utils'

export type AccountId = string | number | bigint

export function toTigerbeetleId(id: AccountId): bigint {
  if (typeof id === 'number') {
    return BigInt(id)
  }
  if (typeof id === 'bigint') {
    return id
  }
  if (typeof id === 'string' && !isNaN(Number(id))) {
    return BigInt(id)
  }
  if (!validateId(id)) {
    throw new Error()
  }

  return uuidToBigInt(id)
}

export function uuidToBigInt(id: string): bigint {
  return BigInt(`0x${id.replace(/-/g, '')}`)
}
