export enum PeerError {
  DuplicateIncomingToken = 'DuplicateIncomingToken',
  DuplicatePeer = 'DuplicatePeer',
  InvalidStaticIlpAddress = 'InvalidStaticIlpAddress',
  InvalidHTTPEndpoint = 'InvalidHTTPEndpoint',
  UnknownAsset = 'UnknownAsset',
  UnknownPeer = 'UnknownPeer',
  InvalidInitialLiquidity = 'InvalidInitialLiquidity'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isPeerError = (o: any): o is PeerError =>
  Object.values(PeerError).includes(o)

export const errorToCode: {
  [key in PeerError]: number
} = {
  [PeerError.DuplicateIncomingToken]: 409,
  [PeerError.DuplicatePeer]: 409,
  [PeerError.InvalidStaticIlpAddress]: 400,
  [PeerError.InvalidHTTPEndpoint]: 400,
  [PeerError.UnknownAsset]: 400,
  [PeerError.UnknownPeer]: 404,
  [PeerError.InvalidInitialLiquidity]: 400
}

export const errorToMessage: {
  [key in PeerError]: string
} = {
  [PeerError.DuplicateIncomingToken]: 'duplicate incoming token',
  [PeerError.DuplicatePeer]:
    'duplicate peer found for same ILP address and asset',
  [PeerError.InvalidStaticIlpAddress]: 'invalid ILP address',
  [PeerError.InvalidHTTPEndpoint]: 'invalid HTTP endpoint',
  [PeerError.UnknownAsset]: 'unknown asset',
  [PeerError.UnknownPeer]: 'unknown peer',
  [PeerError.InvalidInitialLiquidity]: 'invalid initial liquidity for peer'
}
