import { validate, version } from 'uuid'

export function uuidToBigInt(id: string): bigint {
  return BigInt(`0x${id.replace(/-/g, '')}`)
}

export function validateId(id: string): boolean {
  return validate(id) && version(id) === 4
}
