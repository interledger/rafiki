import {
  components as RSComponents,
  paths as RSPaths
} from './generated/resource-server-types'
import {
  components as ASComponents,
  paths as ASPaths
} from './generated/authorization-server-types'

export const getRSPath = <P extends keyof RSPaths>(path: P): string =>
  path as string
export type IncomingPayment =
  RSComponents['schemas']['incoming-payment-with-connection']
export type ILPStreamConnection =
  RSComponents['schemas']['ilp-stream-connection']
export type PaymentPointer = RSComponents['schemas']['payment-pointer']

export const getASPath = <P extends keyof ASPaths>(path: P): string =>
  path as string
export type NonInteractiveGrantRequest = {
  accessToken: ASComponents['schemas']['access_token']
  client: ASComponents['schemas']['client']
}
export type NonInteractiveGrant = {
  accessToken: ASComponents['schemas']['access_token']
  continue: ASComponents['schemas']['continue']
}
export type InteractiveGrantRequest = {
  accessToken: ASComponents['schemas']['access_token']
  client: ASComponents['schemas']['client']
  interact: ASComponents['schemas']['interact-request']
}
export type InteractiveGrant = {
  interact: ASComponents['schemas']['interact-response']
  continue: ASComponents['schemas']['continue']
}
