import { GraphQLErrorCode } from '../../../graphql/errors'

export enum AutoPeeringError {
  InvalidIlpConfiguration = 'InvalidIlpConfiguration',
  InvalidPeerIlpConfiguration = 'InvalidPeerIlpConfiguration',
  UnknownAsset = 'UnknownAsset',
  PeerUnsupportedAsset = 'PeerUnsupportedAsset',
  InvalidPeerUrl = 'InvalidPeerUrl',
  InvalidPeeringRequest = 'InvalidPeeringRequest',
  LiquidityError = 'LiquidityError'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isAutoPeeringError = (o: any): o is AutoPeeringError =>
  Object.values(AutoPeeringError).includes(o)

export const errorToCode: {
  [key in AutoPeeringError]: GraphQLErrorCode
} = {
  [AutoPeeringError.InvalidIlpConfiguration]: GraphQLErrorCode.BadUserInput,
  [AutoPeeringError.InvalidPeerIlpConfiguration]:
    GraphQLErrorCode.InternalServerError,
  [AutoPeeringError.UnknownAsset]: GraphQLErrorCode.NotFound,
  [AutoPeeringError.PeerUnsupportedAsset]: GraphQLErrorCode.BadUserInput,
  [AutoPeeringError.InvalidPeerUrl]: GraphQLErrorCode.NotFound,
  [AutoPeeringError.InvalidPeeringRequest]: GraphQLErrorCode.BadUserInput,
  [AutoPeeringError.LiquidityError]: GraphQLErrorCode.InternalServerError
}

export const errorToMessage: {
  [key in AutoPeeringError]: string
} = {
  [AutoPeeringError.InvalidIlpConfiguration]:
    'The ILP configuration is misconfigured',
  [AutoPeeringError.InvalidPeerIlpConfiguration]: `Requested peer's ILP configuration is misconfigured`,
  [AutoPeeringError.UnknownAsset]: 'Unknown asset',
  [AutoPeeringError.PeerUnsupportedAsset]: 'Peer does not support asset',
  [AutoPeeringError.InvalidPeerUrl]:
    'Peer URL is invalid or peer does not support auto-peering',
  [AutoPeeringError.InvalidPeeringRequest]: 'Invalid peering request',
  [AutoPeeringError.LiquidityError]: 'Could not deposit liquidity to peer'
}

export const errorToHttpCode: {
  [key in AutoPeeringError]: number
} = {
  [AutoPeeringError.InvalidIlpConfiguration]: 400,
  [AutoPeeringError.InvalidPeerIlpConfiguration]: 400,
  [AutoPeeringError.UnknownAsset]: 404,
  [AutoPeeringError.PeerUnsupportedAsset]: 400,
  [AutoPeeringError.InvalidPeerUrl]: 400,
  [AutoPeeringError.InvalidPeeringRequest]: 400,
  [AutoPeeringError.LiquidityError]: 400
}
