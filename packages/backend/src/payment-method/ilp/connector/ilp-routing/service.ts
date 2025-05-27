import { CacheDataStore } from '../../../../middleware/cache/data-stores'
import { BaseService } from '../../../../shared/baseService'
import { IAppConfig } from '../../../../config/app'
import { PeerService } from '../../peer/service'
import { validate as uuidValidate, version as uuidVersion } from 'uuid'

export interface StaticRoute {
  destination: string
  nextHopAddress: string
}

export interface RouterService extends BaseService {
  addStaticRoute(prefix: string, peerId: string): Promise<void>
  removeStaticRoute(prefix: string, peerId: string): Promise<void>
  getNextHop(destination: string): Promise<string | undefined>
  removeRoutesForPeer(peerId: string): Promise<void>
  getOwnAddress(): string
}

export interface RouterServiceDependencies extends BaseService {
  staticIlpAddress: string
  staticRoutes: CacheDataStore<string>
  config: IAppConfig
  peerService: PeerService
}


// Format: "destination1:peer1StaticIlpAddress,destination2:peer2StaticIlpAddress"
async function parseStaticRoutes(deps: RouterServiceDependencies, envValue: string | undefined): Promise<Array<{ destination: string; peerId: string }> | undefined> {
  if (!envValue) {
    return []
  }
  const routes = envValue.split(',')
  return Promise.all(routes.map(async route => {
    const [destination, peerStaticIlpAddress] = route.split(':')
    if (!destination || !peerStaticIlpAddress) {
      throw new Error(`Invalid static route format: ${route}. Expected format: destination:peerId`)
    }
    const peer = await deps.peerService.getByDestinationAddress(peerStaticIlpAddress)
    if (!peer) {
      deps.logger.debug(`Peer not found for address ${peerStaticIlpAddress}`)
      //throw new Error(`Peer not found for address ${peerStaticIlpAddress}`)
    }
    // We are using the peerStaticIlpAddress as a fallback for the peerId if the peer is not found
    // This is because the peerId is not always available when the service is created
    // This is a temporary solution to avoid errors when the service is created
    return { destination, peerId: peer ? peer.id : peerStaticIlpAddress }
  }))
}

export async function createRouterService({
  logger,
  peerService,
  staticIlpAddress,
  staticRoutes,
  config
}: RouterServiceDependencies): Promise<RouterService> {
  const log = logger.child({ service: 'RouterService' })
  const ownAddress = staticIlpAddress
  log.debug({ ownAddress }, 'ownAddress')

  const deps: RouterServiceDependencies = {
    logger: log,
    staticIlpAddress,
    staticRoutes,
    peerService,
    config
  }

  // If not possible to add all routes due to peers not being created yet, routes will be added when next hop is needed.
  const routes = await parseStaticRoutes(deps, config.staticRoutes)
  if (routes) {
    for (const route of routes) {
      await addStaticRoute(deps, route.destination, route.peerId)
    }
  }

  async function addStaticRoute(deps: RouterServiceDependencies, destination: string, peerId: string | undefined) {
    if (!peerId) {
      deps.logger.debug({ destination }, 'no peerId found for destination')
      return
    }
    deps.staticRoutes.set(destination, peerId)
    deps.logger.debug({ prefix: destination, peerId }, 'added static route')
  }

  //TODO This might also need longest prefix matching depending on what we use as destination i.e. full address or just static address
  async function removeStaticRoute(deps: RouterServiceDependencies, destination: string, peerId: string) {
    deps.staticRoutes.delete(destination)
    deps.logger.debug({ staticIlpAddress: destination, peerId }, 'removed static route')
  }

  async function getNextHop(deps: RouterServiceDependencies, destination: string): Promise<string | undefined> {
    const segments = destination.split('.')
    for (let i = segments.length; i > 0; i--) {
      const prefix = segments.slice(0, i).join('.')
      const result = await deps.staticRoutes.get(prefix)
      // This is a temporary solution, will be removed
      if (result) {
        if(uuidValidate(result)) {
          deps.logger.debug({ destination, prefix, peerId: result }, 'static route found')
          return result
        }
        const peer = await deps.peerService.getByDestinationAddress(prefix)
        if (peer) {
          deps.staticRoutes.set(destination, peer.id)
          deps.logger.debug({ destination, prefix, peerId: peer.id }, 'added static route')
          return peer.id
        }
      }
    }
    deps.logger.debug({ destination }, 'no static route found')
    return undefined
  }

  async function removeRoutesForPeer(deps: RouterServiceDependencies, peerId: string) {
    //TODO Same as on removeStaticRoute
    deps.logger.debug({ peerId }, 'removing routes for peer')
  }

  function getOwnAddress(deps: RouterServiceDependencies): string {
    return deps.staticIlpAddress
  }

  return {
    logger: log,
    addStaticRoute: (destination, peerId) => addStaticRoute(deps, destination, peerId),
    removeStaticRoute: (destination, peerId) => removeStaticRoute(deps, destination, peerId),
    getNextHop: (destination) => getNextHop(deps, destination),
    removeRoutesForPeer: (peerId) => removeRoutesForPeer(deps, peerId),
    getOwnAddress: () => getOwnAddress(deps)
  }
} 