import { components, paths as Paths } from './generated/types'

export const getPath = <P extends keyof Paths>(path: P): string =>
  path as string

export type IncomingPayment = components['schemas']['incoming-payment']
export type ILPStreamConnection = components['schemas']['ilp-stream-connection']
