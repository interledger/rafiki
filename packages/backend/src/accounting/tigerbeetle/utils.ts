import { validateId } from '../../shared/utils'
import { AccountId, uuidToBigInt } from '../utils'

export function toTigerbeetleId(id: AccountId): bigint {
  if (typeof id === 'number') {
    return BigInt(id)
  }
  if (typeof id === 'bigint') {
    return id
  }
  if (!validateId(id)) {
    throw new Error()
  }

  return uuidToBigInt(id)
}
