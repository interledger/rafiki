export enum PeerError {
  DuplicateIncomingToken = 'DuplicateIncomingToken',
  InvalidStaticIlpAddress = 'InvalidStaticIlpAddress',
  UnknownAsset = 'UnknownAsset',
  UnknownPeer = 'UnknownPeer'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isPeerError = (o: any): o is PeerError =>
  Object.values(PeerError).includes(o)

export const errorToCode: {
  [key in PeerError]: number
} = {
  [PeerError.DuplicateIncomingToken]: 409,
  [PeerError.InvalidStaticIlpAddress]: 400,
  [PeerError.UnknownAsset]: 400,
  [PeerError.UnknownPeer]: 404
}

export const errorToMessage: {
  [key in PeerError]: string
} = {
  [PeerError.DuplicateIncomingToken]: 'duplicate incoming token',
  [PeerError.InvalidStaticIlpAddress]: 'invalid ILP address',
  [PeerError.UnknownAsset]: 'unknown asset',
  [PeerError.UnknownPeer]: 'unknown peer'
}
