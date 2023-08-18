import { createHash, createHmac } from 'crypto'

export const sha256 = (preimage: Buffer): Buffer => {
  return createHash('sha256').update(preimage).digest()
}

export function hmac(secret: Buffer, message: string): Buffer {
  const hmac = createHmac('sha256', secret)
  hmac.update(message, 'utf8')
  return hmac.digest()
}
