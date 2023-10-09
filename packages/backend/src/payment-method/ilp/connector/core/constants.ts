import { createHash } from 'crypto'

export const MAX_UINT_64 = BigInt('0xffffffffffffffff')
export const MIN_INT_64 = BigInt('-9223372036854775808')
export const MAX_INT_64 = BigInt('9223372036854775807')
export const STATIC_FULFILLMENT = Buffer.alloc(32)
export const STATIC_CONDITION = createHash('SHA256')
  .update(STATIC_FULFILLMENT)
  .digest()
export const SELF_PEER_ID = 'self'
