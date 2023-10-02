import PrefixMap from '../lib/prefix-map'
import { IncomingRoute } from '../types/routing'
import { Relation } from '../types/relation'
import { randomBytes } from 'crypto'
import { hmac, sha256 } from '../lib/utils'

export interface PeerOpts {
  peerId: string
  relation: Relation
  routingSecret?: string
  shouldAuth?: boolean
}

export class Peer {
  private peerId: string
  private relation: Relation
  private routes: PrefixMap<IncomingRoute>

  private routingSecret: Buffer
  private shouldAuth: boolean

  constructor({ peerId, relation, routingSecret, shouldAuth }: PeerOpts) {
    this.peerId = peerId
    this.relation = relation

    this.routingSecret = routingSecret
      ? Buffer.from(routingSecret, 'base64')
      : randomBytes(32)
    this.shouldAuth = shouldAuth || false

    // TODO: Possibly inefficient instantiating this if not a ccp-receiver? Though the code is quite clean without needing to pass the data to here
    this.routes = new PrefixMap()
  }

  getPrefix(prefix: string): IncomingRoute | undefined {
    return this.routes.get(prefix)
  }

  insertRoute(route: IncomingRoute): boolean {
    if (this.shouldAuth) {
      const auth = hmac(this.routingSecret, route.prefix)
      if (sha256(auth) !== route.auth) {
        return false
      }
    }
    this.routes.insert(route.prefix, route)
    // TODO Check if actually changed
    return true
  }

  deleteRoute(prefix: string): boolean {
    this.routes.delete(prefix)

    // TODO Check if actually changed
    return true
  }

  getPrefixes(): string[] {
    return this.routes.keys()
  }

  getRelation(): Relation {
    return this.relation
  }
}
