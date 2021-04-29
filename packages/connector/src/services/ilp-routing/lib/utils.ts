import { randomBytes, createHash, createHmac } from 'crypto'

export const sha256 = (preimage: Buffer): Buffer => {
  return createHash('sha256').update(preimage).digest()
}

export function hmac(secret: Buffer, message: string): Buffer {
  const hmac = createHmac('sha256', secret)
  hmac.update(message, 'utf8')
  return hmac.digest()
}

export function uuid(): string {
  const random = randomBytes(16)
  random[6] = (random[6] & 0x0f) | 0x40
  random[8] = (random[8] & 0x3f) | 0x80
  return random
    .toString('hex')
    .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
}
