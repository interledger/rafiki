import { PeerInfo } from '../../types'
import { Observable } from 'rxjs'

export interface Peer extends Readonly<PeerInfo> {
  send: (data: Buffer) => Promise<Buffer>
}

export interface PeersService {
  readonly added: Observable<Peer>
  readonly updated: Observable<Peer>
  readonly deleted: Observable<string>

  /**
   * Load a peer. Throws if the peer cannot be loaded.
   */
  get: (id: string) => Promise<Peer>

  /**
   * Add a peer based on the provided config
   */
  add: (peer: Readonly<PeerInfo>) => Promise<Peer>

  /**
   * Update a peer
   */
  update: (peer: Readonly<PeerInfo>) => Promise<Peer>

  /**
   * Remove a peer
   */
  remove: (peerId: string) => Promise<void>

  // TODO: Should this be an iterator
  list: () => Promise<Peer[]>
}

export * from './in-memory'
