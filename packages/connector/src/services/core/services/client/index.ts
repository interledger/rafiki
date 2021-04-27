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
  let peer
  if (typeof peerOrPeerId === 'string') {
    if (!peers) throw new Error('PeerService required')
    peer = await peers.get(peerOrPeerId)
  } else {
    peer = peerOrPeerId
  }
  return peer.send(data)
}

export * from 'axios'
