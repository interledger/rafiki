import RoutingTable from './routing-table'
import { Route } from '../types/routing'
import ForwardingRoutingTable, { RouteUpdate } from './forwarding-routing-table'
// eslint-disable-next-line
import { canDragonFilter } from '../lib/dragon'
import { sha256 } from '../lib/utils'

export class Router {
  private globalPrefix: string
  private ownAddress?: string
  private routingTable: RoutingTable
  private forwardingRoutingTable: ForwardingRoutingTable

  constructor() {
    this.routingTable = new RoutingTable()
    this.forwardingRoutingTable = new ForwardingRoutingTable()
    this.globalPrefix = 'g'
  }

  setGlobalPrefix(prefix: string): void {
    this.globalPrefix = prefix
  }

  setOwnAddress(address: string): void {
    this.ownAddress = address
  }

  getOwnAddress(): string {
    if (this.ownAddress === undefined) {
      throw new Error('ownAddress not set')
    }
    return this.ownAddress
  }

  addRoute(prefix: string, route: Route): void {
    this.updateLocalRoute(prefix, route)
  }

  removeRoute(prefix: string): void {
    this.updateLocalRoute(prefix)
  }

  getRoutingTable(): RoutingTable {
    return this.routingTable
  }

  getForwardingRoutingTable(): ForwardingRoutingTable {
    return this.forwardingRoutingTable
  }

  // TODO: Maybe this shouldn't throw an error and instead just return undefined
  nextHop(prefix: string): string {
    const route = this.routingTable.resolve(prefix)
    const nextHop = route && route.nextHop
    if (nextHop) {
      return nextHop
    } else {
      throw new Error(
        "Can't route the request due to no route found for given prefix"
      )
    }
  }

  /**
   * Get currentBest from localRoutingTable
   * check if newNextHop has changed. If it has, update localRoutingTable and  forwardingRouteTable
   * @param prefix prefix
   * @param route route
   */
  private updateLocalRoute(prefix: string, route?: Route): boolean {
    const currentBest = this.routingTable.get(prefix)
    const currentNextHop = currentBest && currentBest.nextHop
    const newNextHop = route && route.nextHop

    if (newNextHop !== currentNextHop) {
      if (route) {
        // log.trace('new best route for prefix. prefix=%s oldBest=%s newBest=%s', prefix, currentNextHop, newNextHop)
        this.routingTable.insert(prefix, route)
      } else {
        // log.trace('no more route available for prefix. prefix=%s', prefix)
        this.routingTable.delete(prefix)
      }

      this.updateForwardingRoute(prefix, route)

      return true
    }

    return false
  }

  private getGlobalPrefix(): string {
    return this.globalPrefix
  }

  /**
   * updating forwarding routing table
   * 1. If route is defined.
   * 2.   Update path and auth on route
   * 3.   If various checks on route set route to undefined
   * 4. Get Current best from forwarding Routing Table
   * 5. if newNextHop
   * 6.   Update the forwarding routing table
   * 7.   Check to apply dragon filtering based on the update on other prefixes.
   * 8. Else do nothing
   * @param prefix prefix
   * @param route route
   */
  private updateForwardingRoute(prefix: string, route?: Route): void {
    if (route) {
      route = {
        ...route,
        path: [this.getOwnAddress(), ...route.path],
        auth: route.auth ? sha256(route.auth) : Buffer.from('')
      }

      if (
        // Routes must start with the global prefix
        !prefix.startsWith(this.getGlobalPrefix()) ||
        // Don't publish the default route
        prefix === this.getGlobalPrefix() ||
        // Don't advertise local customer routes that we originated. Packets for
        // these destinations should still reach us because we are advertising our
        // own address as a prefix.
        (prefix.startsWith(this.getOwnAddress() + '.') &&
          route.path.length === 1) // ||

        // canDragonFilter(
        //   this.forwardingRoutingTable,
        //   this.getAccountRelation,
        //   prefix,
        //   route
        // )
      ) {
        route = undefined
      }
    }

    const currentBest = this.forwardingRoutingTable.get(prefix)

    const currentNextHop =
      currentBest && currentBest.route && currentBest.route.nextHop
    const newNextHop = route && route.nextHop

    if (currentNextHop !== newNextHop) {
      const epoch = this.forwardingRoutingTable.currentEpoch++
      const routeUpdate: RouteUpdate = {
        prefix,
        route,
        epoch
      }

      this.forwardingRoutingTable.insert(prefix, routeUpdate)

      // log.trace('logging route update. update=%j', routeUpdate)

      // Remove from forwarding routing table.
      if (currentBest) {
        this.forwardingRoutingTable.log[currentBest.epoch] = null
      }

      this.forwardingRoutingTable.log[epoch] = routeUpdate

      if (route) {
        // We need to re-check any prefixes that start with this prefix to see
        // if we can apply DRAGON filtering.
        //
        // Note that we do this check *after* we have added the new route above.
        const subPrefixes =
          this.forwardingRoutingTable.getKeysStartingWith(prefix)

        for (const subPrefix of subPrefixes) {
          if (subPrefix === prefix) continue

          const routeUpdate = this.forwardingRoutingTable.get(subPrefix)

          if (!routeUpdate || !routeUpdate.route) continue

          this.updateForwardingRoute(subPrefix, routeUpdate.route)
        }
      }
    }
  }
}

export { ForwardingRoutingTable, RouteUpdate }
