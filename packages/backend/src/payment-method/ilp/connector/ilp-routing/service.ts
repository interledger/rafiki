import { BaseService } from '../../../../shared/baseService'
import { PeerService } from '../../peer/service'

export interface RouterService extends BaseService {
  addStaticRoute(prefix: string, peerId: string): void
  removeStaticRoute(prefix: string, peerId: string): void
  getNextHop(destination: string): string | undefined
  removeRoutesForPeer(peerId: string): void
  getOwnAddress(): string
}

export interface RouterServiceDependencies extends BaseService {
  staticIlpAddress: string
  peerService: PeerService //TODO Just for testing things
}

export async function createRouterService({
  logger,
  staticIlpAddress,
  peerService
}: RouterServiceDependencies): Promise<RouterService> {
  //TODO Use these in the future for dynamic routing with longest prefix matching
  //const router = new Router()
  //const routeManager = new RouteManager(router)
  const log = logger.child({ service: 'RouterService' })
  
  //router.setOwnAddress(ilpAddress)
  const ownAddress = staticIlpAddress
  log.debug({ ownAddress }, 'ownAddress')

  // Static route map: destiination -> peerId
  // Should we also have routes in db in peers table/tenant settings table?
  const staticRoutes: Map<string, string> = new Map()
  
  //TODO Remove this once we have a way to store static routes
  if (ownAddress === 'test.cloud-nine-wallet') {
    // Forward all happy-life-bank traffic to global-bank
    const peer = await peerService.getByDestinationAddress('test.global-bank')
    if(peer) {
      staticRoutes.set('test.happy-life-bank', peer.id)
      log.info('Hardcoded static route: happy-life-bank -> global-bank')
    }
  } else if (ownAddress === 'test.global-bank') {
    // Forward all happy-life-bank traffic to us-treasury
    const peer = await peerService.getByDestinationAddress('test.us-treasury')
    if(peer) {
      staticRoutes.set('test.happy-life-bank', peer.id)
    }
    log.info('Hardcoded static route: happy-life-bank -> us-treasury')
  }

  const service: RouterService = {
    logger: log,
    
    // Example: addStaticRoute('test.happy-life-bank', '5ed1e6aa-7090-4a59-87d2-79201944fe65')
    addStaticRoute(destination: string, peerId: string) {
      staticRoutes.set(destination, peerId)
      log.debug({ prefix: destination, peerId }, 'added static route')
    },
    
    // TODO Update this to also be able to remove the route based on longest prefix match?
    removeStaticRoute(destination: string, peerId: string) {
      staticRoutes.delete(destination)
      log.debug({ staticIlpAddress: destination, peerId }, 'removed static route')
    },
    
    getNextHop(destination: string): string | undefined {
      const segments = destination.split('.')
      for (let i = segments.length; i > 0; i--) {
        const prefix = segments.slice(0, i).join('.')
        if (staticRoutes.has(prefix)) {
          const peerId = staticRoutes.get(prefix)
          log.debug({ destination, prefix, peerId }, 'static route found')
          return peerId
        }
      }
      log.debug({ destination }, 'no static route found')
      return undefined
    },
    
    removeRoutesForPeer(peerId: string) {
      for (const [destination, id] of staticRoutes.entries()) {
        if (id === peerId) {
          staticRoutes.delete(destination)
          log.debug({ prefix: destination, peerId }, 'removed static route on peer removal')
        }
      }
    },

    getOwnAddress(): string {
      return ownAddress
    }
  }
  return service
} 