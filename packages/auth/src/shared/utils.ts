import * as crypto from 'crypto'
import { Access } from '../access/model'

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function accessToBody(access: Access) {
  return Object.fromEntries(
    Object.entries(access.toJSON()).filter(
      ([k, v]) =>
        v != null &&
        k != 'id' &&
        k != 'grantId' &&
        k != 'createdAt' &&
        k != 'updatedAt'
    )
  )
}

export function generateNonceOrToken(): string {
  return crypto.randomBytes(8).toString('hex').toUpperCase()
}
