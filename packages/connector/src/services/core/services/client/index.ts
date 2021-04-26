import { PeersService, Peer } from '../peers'

export interface Client {
  send: (data: Buffer) => Promise<Buffer>
}

export async function sendToPeer(peer: Peer, data: Buffer): Promise<Buffer>
export async function sendToPeer(
  peerId: string,
  data: Buffer,
  peers: PeersService
): Promise<Buffer>

export async function sendToPeer(
  peerOrPeerId: Peer | string,
  data: Buffer,
  peers?: PeersService
): Promise<Buffer> {
  if (typeof peerOrPeerId === 'string' && !peers) {
    throw new Error('PeerService required')
  }
  const peer =
    typeof peerOrPeerId === 'string'
      ? await peers!.get(peerOrPeerId)
      : peerOrPeerId
  return peer.send(data)
}

export * from 'axios'
