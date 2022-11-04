import {
  components as rsComponents,
  paths as RSPaths
} from './generated/resource-server-types'
import { paths as ASPaths } from './generated/authorization-server-types'

export const getRSPath = <P extends keyof RSPaths>(path: P): string =>
  path as string
export const getASPath = <P extends keyof ASPaths>(path: P): string =>
  path as string

export type IncomingPayment =
  rsComponents['schemas']['incoming-payment-with-connection']
export type ILPStreamConnection =
  rsComponents['schemas']['ilp-stream-connection']
export type PaymentPointer = rsComponents['schemas']['payment-pointer']
