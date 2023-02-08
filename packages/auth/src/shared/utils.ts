import * as crypto from 'crypto'

export function generateNonce(): string {
  return crypto.randomBytes(8).toString('hex').toUpperCase()
}

export function generateToken(): string {
  return crypto.randomBytes(10).toString('hex').toUpperCase()
}
