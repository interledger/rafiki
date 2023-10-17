export enum IlpPeerError {
  DuplicateIlpPeer = 'DuplicateIlpPeer',
  UnknownPeer = 'UnknownPeer',
  InvalidStaticIlpAddress = 'InvalidStaticIlpAddress'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isIlpPeerError = (o: any): o is IlpPeerError =>
  Object.values(IlpPeerError).includes(o)

export const errorToCode: {
  [key in IlpPeerError]: number
} = {
  [IlpPeerError.DuplicateIlpPeer]: 409,
  [IlpPeerError.InvalidStaticIlpAddress]: 400,
  [IlpPeerError.UnknownPeer]: 404
}

export const errorToMessage: {
  [key in IlpPeerError]: string
} = {
  [IlpPeerError.DuplicateIlpPeer]:
    'duplicate peer found for same ILP address and asset',
  [IlpPeerError.InvalidStaticIlpAddress]: 'invalid ILP address',
  [IlpPeerError.UnknownPeer]: 'unknown peer'
}
