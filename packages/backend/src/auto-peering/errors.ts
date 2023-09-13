export enum AutoPeeringError {
  InvalidIlpConfiguration = 'InvalidIlpConfiguration',
  InvalidPeerIlpConfiguration = 'InvalidPeerIlpConfiguration',
  UnknownAsset = 'UnknownAsset',
  PeerUnsupportedAsset = 'PeerUnsupportedAsset',
  InvalidPeerUrl = 'InvalidPeerUrl',
  InvalidPeeringRequest = 'InvalidPeeringRequest',
  DuplicatePeer = 'DuplicatePeer'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isAutoPeeringError = (o: any): o is AutoPeeringError =>
  Object.values(AutoPeeringError).includes(o)

export const errorToCode: {
  [key in AutoPeeringError]: number
} = {
  [AutoPeeringError.InvalidIlpConfiguration]: 400,
  [AutoPeeringError.InvalidPeerIlpConfiguration]: 400,
  [AutoPeeringError.UnknownAsset]: 404,
  [AutoPeeringError.PeerUnsupportedAsset]: 400,
  [AutoPeeringError.InvalidPeerUrl]: 400,
  [AutoPeeringError.InvalidPeeringRequest]: 400,
  [AutoPeeringError.DuplicatePeer]: 409
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
  [AutoPeeringError.DuplicatePeer]: 'Duplicate peer'
}
