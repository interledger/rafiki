import { Peer, PeersService } from '.'
import { PeerInfo, PeerRelation } from '../../types'
import { AxiosClient } from '../client/axios'
import { Subject, Observable } from 'rxjs'
import { PeerNotFoundError } from '../../errors'
import debug from 'debug'
import { AxiosRequestConfig } from 'axios'
// Implementations SHOULD use a better logger than debug for production services
const log = debug('rafiki:in-memory-peers-service')

/**
 * An in-memory peer service for development and testing purposes.
 */
export class InMemoryPeer implements Peer {
  readonly [key: string]: any
  id: string
  url?: string
  relation: PeerRelation
  relationWeight?: number
  authToken?: string
  isCcpSender: boolean
  isCcpReceiver: boolean
  accountId: string

  readonly axiosClient?: AxiosClient

  constructor(info: PeerInfo) {
    // These sets are redundant due to the Object.assign, but necessary to satisfy TypeScript.
    // See: https://github.com/microsoft/TypeScript/issues/26792
    this.id = info.id
    this.relation = info.relation
    this.isCcpSender = info.isCcpSender || false
    this.isCcpReceiver = info.isCcpReceiver || false
    this.accountId = info.accountId
    Object.assign(this, info)

    if (this.url) {
      const axiosConfig: AxiosRequestConfig = {
        responseType: 'arraybuffer',
        headers: {}
      }
      if (this.authToken) {
        axiosConfig.headers = { Authorization: `Bearer ${this.authToken}` }
      }
      this.axiosClient = new AxiosClient(this.url, axiosConfig)
    }
  }

  public send(data: Buffer): Promise<Buffer> {
    if (!this.axiosClient) throw new Error('No send client configured for peer')
    return this.axiosClient.send(data)
  }
}

export class InMemoryPeers implements PeersService {
  private _addedPeers: Subject<Peer>
  private _updatedPeers: Subject<Peer>
  private _removedPeers: Subject<string>
  private _peers = new Map<string, InMemoryPeer>()

  constructor() {
    this._addedPeers = new Subject<Peer>()
    this._updatedPeers = new Subject<Peer>()
    this._removedPeers = new Subject<string>()
  }

  get added(): Observable<Peer> {
    return this._addedPeers.asObservable()
  }

  get updated(): Observable<Peer> {
    return this._updatedPeers.asObservable()
  }

  get deleted(): Observable<string> {
    return this._removedPeers.asObservable()
  }

  public async get(id: string): Promise<Peer> {
    const peer = this._peers.get(id)
    if (!peer) throw new PeerNotFoundError(id)
    return peer
  }

  async add(peerInfo: Readonly<PeerInfo>): Promise<InMemoryPeer> {
    const peer = new InMemoryPeer(peerInfo)
    this._peers.set(peer.id, peer)
    this._addedPeers.next(peer)
    log('added peer', peerInfo)
    return peer
  }

  async update(peerInfo: Readonly<PeerInfo>): Promise<InMemoryPeer> {
    let peer = this._peers.get(peerInfo.id)
    if (!peer) {
      throw new PeerNotFoundError(peerInfo.id)
    }
    peer = new InMemoryPeer(peerInfo)
    this._peers.set(peerInfo.id, peer)
    this._updatedPeers.next(peer)
    log('updated peer', peerInfo)
    return peer
  }

  async remove(peerId: string): Promise<void> {
    const oldPeer = this._peers.get(peerId)
    if (!oldPeer) {
      throw new PeerNotFoundError(peerId)
    }
    this._peers.delete(peerId)
    this._removedPeers.next(peerId)
    log('removed peer', oldPeer)
  }

  async list(): Promise<Peer[]> {
    return [...this._peers.values()].map((peer) => peer.info)
  }
}
