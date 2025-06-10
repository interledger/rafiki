import { ILPContext, ILPMiddleware } from '../rafiki'
import { RouterService } from '../../ilp-routing/service'

export interface RoutingMiddlewareOptions {
  routerService: RouterService
}

export function createRoutingMiddleware({
  routerService
}: RoutingMiddlewareOptions): ILPMiddleware {
  return async function routing(
    { request, services: { logger } }: ILPContext,
    next: () => Promise<void>
  ): Promise<void> {
    const { destination } = request.prepare
    const ownAddress = routerService.getOwnAddress()

    // If the destination is for us (exact match or sub-address), next...
    if (
      destination.startsWith(ownAddress + '.') ||
      destination === ownAddress
    ) {
      logger.debug({ destination }, 'reached destination')
      await next()
      return
    }

    const nextHop = await routerService.getNextHop(destination)
    request.nextHop = nextHop

    await next()
  }
}
