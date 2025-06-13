import { CacheDataStore } from '../../../../middleware/cache/data-stores'
import { BaseService } from '../../../../shared/baseService'
import { IAppConfig } from '../../../../config/app'

export interface RouterService extends BaseService {
  addStaticRoute(prefix: string, peerId: string): Promise<void>
  removeStaticRoute(prefix: string, peerId: string): Promise<void>
  getNextHop(destination: string): Promise<string | undefined>
  getOwnAddress(): string
}

export interface RouterServiceDependencies extends BaseService {
  staticIlpAddress: string
  staticRoutes: CacheDataStore<string[]>
  config: IAppConfig
}

export async function createRouterService({
  logger,
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
    config
  }

  async function addStaticRoute(
    deps: RouterServiceDependencies,
    destination: string,
    peerId: string
  ) {
    const existingPeers = (await deps.staticRoutes.get(destination)) || []
    if (!existingPeers.includes(peerId)) {
      existingPeers.push(peerId)
      await deps.staticRoutes.set(destination, existingPeers)
      deps.logger.debug(
        { prefix: destination, peerId, totalPeers: existingPeers.length },
        'added static route'
      )
    }
  }

  async function removeStaticRoute(
    deps: RouterServiceDependencies,
    destination: string,
    peerId: string
  ) {
    const existingPeers = await deps.staticRoutes.get(destination)
    if (existingPeers) {
      const updatedPeers = existingPeers.filter((id) => id !== peerId)
      if (updatedPeers.length > 0) {
        await deps.staticRoutes.set(destination, updatedPeers)
      } else {
        await deps.staticRoutes.delete(destination)
      }
      deps.logger.debug(
        { destination, peerId, remainingPeers: updatedPeers.length },
        'removed static route'
      )
    }
  }

  async function getNextHop(
    deps: RouterServiceDependencies,
    destination: string
  ): Promise<string | undefined> {
    const segments = destination.split('.')
    for (let i = segments.length; i > 0; i--) {
      const prefix = segments.slice(0, i).join('.')
      const peerIds = await deps.staticRoutes.get(prefix)

      if (peerIds && peerIds.length > 0) {
        // If multiple peers are found as next hops, we select one randomly since we currently don't have weights for each route
        const selectedPeer =
          peerIds.length === 1
            ? peerIds[0]
            : peerIds[Math.floor(Math.random() * peerIds.length)]
        deps.logger.debug(
          { destination, prefix, selectedPeer, availablePeers: peerIds.length },
          'found next hop'
        )
        return selectedPeer
      }
    }
    deps.logger.debug({ destination }, 'no static route found')
    return undefined
  }

  function getOwnAddress(deps: RouterServiceDependencies): string {
    return deps.staticIlpAddress
  }

  return {
    logger: log,
    addStaticRoute: (destination, peerId) =>
      addStaticRoute(deps, destination, peerId),
    removeStaticRoute: (destination, peerId) =>
      removeStaticRoute(deps, destination, peerId),
    getNextHop: (destination) => getNextHop(deps, destination),
    getOwnAddress: () => getOwnAddress(deps)
  }
}
