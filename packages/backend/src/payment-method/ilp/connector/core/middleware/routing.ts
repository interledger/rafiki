import { Errors } from 'ilp-packet'
import { ILPContext, ILPMiddleware } from '../rafiki'
import { RouterService } from '../../ilp-routing/service'

const { UnreachableError } = Errors

export interface RoutingMiddlewareOptions {
  routerService: RouterService
}

export function createRoutingMiddleware({
  routerService
}: RoutingMiddlewareOptions): ILPMiddleware {
  return async function routing(
    { request, services: { logger, peers } }: ILPContext,
    next: () => Promise<void>
  ): Promise<void> {
    const { destination } = request.prepare
    const ownAddress = routerService.getOwnAddress()

    // If the destination is for us (exact match or sub-address), next...
    if (destination.startsWith(ownAddress + '.') || destination === ownAddress) {
      logger.debug({ destination }, 'reached destination')
      await next()
      return
    }

    const nextHop = await routerService.getNextHop(destination)
    if (nextHop) {
      logger.debug({ destination }, 'found next hop')
      request.nextHop = nextHop
      await next()
      return
    }

    // Check if destination is our direct peer since we don't have a next hop configured
    //TODO Not completely comfortable with going to the db for this check, maybe we can do it differently here
    const peer = await peers.getByDestinationAddress(destination)
    if (peer) {
      logger.debug({ destination }, 'next hop is destination peer')
    } else {
      logger.debug({ destination }, 'no route found for destination')
    }

    await next()
  }
} 