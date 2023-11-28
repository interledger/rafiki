import { Relation } from '../types/relation'
import { Router } from '../ilp-router'
import { Peer } from './peer'
import { IncomingRoute, Route } from '../types/routing'

export class RouteManager {
  private peers: Map<string, Peer> = new Map()
  private router: Router

  constructor(router: Router) {
    this.router = router
  }

  // Possibly also allow a route to be added defaulted?
  addPeer(peerId: string, relation: Relation): void {
    const peer = new Peer({ peerId: peerId, relation: relation })
    this.peers.set(peerId, peer)
  }

  removePeer(peerId: string): void {
    const peer = this.getPeer(peerId)
    if (peer) {
      const prefixes = peer.getPrefixes()
      this.peers.delete(peerId)
      prefixes.forEach((prefix) => this.updatePrefix(prefix))
    }
  }

  getPeer(peerId: string): Peer | undefined {
    return this.peers.get(peerId)
  }

  getPeerList(): string[] {
    return Array.from(this.peers.keys())
  }

  // Do a check if the peerId exists as a peer and then also add the route to the routing table
  addRoute(route: IncomingRoute): void {
    const peer = this.getPeer(route.peer)
    if (peer) {
      // Gotcha the insert of the route into the peers routing table must occur before calling updatePrefix
      peer.insertRoute(route)
      this.updatePrefix(route.prefix)
    }
  }

  removeRoute(peerId: string, prefix: string): void {
    const peer = this.getPeer(peerId)
    if (peer) {
      peer.deleteRoute(prefix)
      this.updatePrefix(prefix)
    }
  }

  /**
   * get best peer for prefix and updateRouting based on the new route
   * @param prefix prefix
   */
  private updatePrefix(prefix: string): void {
    const newBest = this.getBestPeerForPrefix(prefix)
    this.updateRouteInRouter(prefix, newBest)
  }

  /**
   * Find the best peer for the prefix routing to
   * 1. Ideal to use configure routes
   * 2. Else look in localRoutes as built before to find exact route
   * 3. If not exact route need to find 'bestRoute' based on peers
   * @param prefix prefix
   */
  private getBestPeerForPrefix(prefix: string): Route | undefined {
    const bestRoute = Array.from(this.peers.values())
      .map((peer) => peer.getPrefix(prefix))
      .filter((a): a is IncomingRoute => !!a)
      .sort((a?: IncomingRoute, b?: IncomingRoute) => {
        if (!a && !b) {
          return 0
        } else if (!a) {
          return 1
        } else if (!b) {
          return -1
        }

        // First sort by peer weight
        const weightA = a.weight ? a.weight : 0
        const weightB = b.weight ? b.weight : 0

        if (weightA !== weightB) {
          return weightB - weightA
        }

        // Then sort by path length
        const pathA = a.path.length
        const pathB = b.path.length

        if (pathA !== pathB) {
          return pathA - pathB
        }

        // Catch all
        return 0
      })[0]

    return (
      bestRoute && {
        nextHop: bestRoute.peer,
        path: bestRoute.path,
        weight: bestRoute.weight,
        auth: bestRoute.auth
      }
    )
  }

  private updateRouteInRouter(
    prefix: string,
    newBest: Route | undefined
  ): void {
    if (newBest) {
      this.router.addRoute(prefix, newBest)
    } else {
      this.router.removeRoute(prefix)
    }
  }
}
