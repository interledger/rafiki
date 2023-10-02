import { Route } from '../types/routing'
// import { create as createLogger } from '../common/log'
// const log = createLogger('dragon')
import { Relation, getRelationPriority } from '../types/relation'
import ForwardingRoutingTable from '../ilp-router/forwarding-routing-table'

/**
 * Check whether a route can be filtered out based on DRAGON rules.
 *
 * See http://route-aggregation.net/.
 *
 * The basic idea is that if we have a more general route that is as good as a
 * more specific route, we don't need to advertise the more specific route.
 *
 * This removes a lot of routing updates across a large network and has basically
 * no downside.
 *
 * Note that we use DRAGON filtering, but *not* DRAGON aggregation. There are
 * several reasons for this:
 *
 *  * ILP address space is a lot less dense than IPv4 address space, so
 *    DRAGON aggregation would not be a significant optimization.
 *
 *  * We may want to secure our routing protocol using a mechanism similar to
 *    BGPsec, which precludes aggregation.
 *
 *  * We will recommend that owners of tier-1 ILP address space are also real
 *    connectors which participate in the routing protocol and originate a route
 *    advertisement for their tier-1 prefix. This will enable DRAGON filtering
 *    to apply to a lot more situations where otherwise only DRAGON aggregation
 *    would be applicable.
 */
export function canDragonFilter(
  routingTable: ForwardingRoutingTable,
  getRelation: (prefix: string) => Relation,
  prefix: string,
  route: Route
): boolean {
  // Find any less specific route
  for (const parentPrefix of routingTable.getKeysPrefixesOf(prefix)) {
    const parentRouteUpdate = routingTable.get(parentPrefix)

    if (!parentRouteUpdate || !parentRouteUpdate.route) {
      // log.warn('found a parent prefix, but no parent route; this should never happen. prefix=%s parentPrefix=%s', prefix, parentPrefix)
      continue
    }

    const parentRoute = parentRouteUpdate.route

    if (parentRoute.nextHop === '') {
      // We are the origin of the parent route, cannot DRAGON filter
      continue
    }

    const parentRelation = getRelation(parentRoute.nextHop)
    const childRelation = getRelation(route.nextHop)
    if (
      getRelationPriority(parentRelation) < getRelationPriority(childRelation)
    ) {
      // The more specific route is better for us, so we keep it
      continue
    }

    // log.trace('applied DRAGON route filter. prefix=%s parentPrefix=%s', prefix, parentPrefix)
    return true
  }

  return false
}
