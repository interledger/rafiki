export {
  IncomingPayment,
  ILPStreamConnection,
  InteractiveGrant,
  NonInteractiveGrant,
  isInteractiveGrant,
  isNonInteractiveGrant
} from './types'

export {
  createAuthenticatedClient,
  createUnauthenticatedClient,
  AuthenticatedClient,
  UnauthenticatedClient
} from './client'
