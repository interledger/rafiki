import { components, paths as Paths } from './generated/types'

export const getPath = <P extends keyof Paths>(path: P): string =>
  path as string

export type IncomingPayment =
  components['schemas']['incoming-payment-with-connection']
export type ILPStreamConnection = components['schemas']['ilp-stream-connection']
export type PaymentPointer = components['schemas']['payment-pointer']
export type JWK = components['schemas']['json-web-key']
export type JWKS = components['schemas']['json-web-key-set']
