import { AxiosInstance } from 'axios'
//import { PeersService, Peer } from '../peers'
import { Errors } from 'ilp-packet'
import { IlpAccount } from './accounts'

//export interface Client {
//  send: (data: Buffer) => Promise<Buffer>
//}

export async function sendToPeer(
  client: AxiosInstance,
  account: IlpAccount,
  prepare: Buffer
): Promise<Buffer> {
  const { http } = account
  if (!http) {
    throw new Errors.UnreachableError('no outgoing endpoint')
  }
  const res = await client.post<Buffer>(http.outgoingEndpoint, prepare, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${http.outgoingToken}` }
  })
  return res.data
}

/*
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
*/
