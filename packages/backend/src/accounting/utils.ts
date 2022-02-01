import assert from 'assert'

import { validateId } from '../shared/utils'

export type AccountId = string | number

export function toTigerbeetleId(id: AccountId): bigint {
  if (typeof id === 'number') {
    return BigInt(id)
  }
  assert.ok(validateId(id))
  return uuidToBigInt(id)
}

export function uuidToBigInt(id: string): bigint {
  return BigInt(`0x${id.replace(/-/g, '')}`)
}
