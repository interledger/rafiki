export enum PeerError {
  DuplicateIncomingToken = 'DuplicateIncomingToken',
  InvalidStaticIlpAddress = 'InvalidStaticIlpAddress',
  UnknownPeer = 'UnknownPeer'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isPeerError = (o: any): o is PeerError =>
  Object.values(PeerError).includes(o)
