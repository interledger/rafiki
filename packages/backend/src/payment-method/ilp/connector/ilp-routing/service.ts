import { CacheDataStore } from '../../../../middleware/cache/data-stores'
import { BaseService } from '../../../../shared/baseService'
import { IAppConfig } from '../../../../config/app'

interface RouteEntry {
  peerId: string
  assetId: string
}

export interface RouterService extends BaseService {
  addStaticRoute(
    prefix: string,
    peerId: string,
    tenantId: string,
    assetId: string
  ): Promise<void>
  removeStaticRoute(
    prefix: string,
    peerId: string,
    tenantId: string,
    assetId: string
  ): Promise<void>
  getNextHop(
    destination: string,
    tenantId: string,
    assetId?: string
  ): Promise<string | undefined>
  getOwnAddress(): string
}

export interface RouterServiceDependencies extends BaseService {
  staticIlpAddress: string
  staticRoutes: CacheDataStore<RouteEntry[]>
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
    peerId: string,
    tenantId: string,
    assetId: string
  ) {
    const key = `${tenantId}:${destination}`
    const existingRoutes = (await deps.staticRoutes.get(key)) || []
    const existingRoute = existingRoutes.find(
      (route) => route.peerId === peerId && route.assetId === assetId
    )

    if (!existingRoute) {
      existingRoutes.push({ peerId, assetId })
      await deps.staticRoutes.set(key, existingRoutes)
      deps.logger.debug(
        { prefix: destination, peerId, assetId, tenantId },
        'added static route'
      )
    }
  }

  async function removeStaticRoute(
    deps: RouterServiceDependencies,
    destination: string,
    peerId: string,
    tenantId: string,
    assetId: string
  ) {
    const key = `${tenantId}:${destination}`
    const existingRoutes = await deps.staticRoutes.get(key)
    if (existingRoutes) {
      const updatedRoutes = existingRoutes.filter(
        (route) => !(route.peerId === peerId && route.assetId === assetId)
      )
      if (updatedRoutes.length > 0) {
        await deps.staticRoutes.set(key, updatedRoutes)
      } else {
        await deps.staticRoutes.delete(key)
      }
      deps.logger.debug(
        { destination, peerId, assetId, tenantId },
        'removed static route'
      )
    }
  }

  async function getNextHop(
    deps: RouterServiceDependencies,
    destination: string,
    tenantId: string,
    assetId?: string
  ): Promise<string | undefined> {
    const segments = destination.split('.')
    for (let i = segments.length; i > 0; i--) {
      const prefix = segments.slice(0, i).join('.')
      const key = `${tenantId}:${prefix}`
      const routes = await deps.staticRoutes.get(key)

      if (routes && routes.length > 0) {
        const filteredRoutes = assetId
          ? routes.filter((route) => route.assetId === assetId)
          : routes

        if (filteredRoutes.length > 0) {
          // If multiple routes are found, select one randomly
          const selectedRoute =
            filteredRoutes.length === 1
              ? filteredRoutes[0]
              : filteredRoutes[
                  Math.floor(Math.random() * filteredRoutes.length)
                ]

          deps.logger.debug(
            {
              destination,
              prefix,
              tenantId,
              assetId,
              selectedPeer: selectedRoute.peerId
            },
            'found next hop'
          )
          return selectedRoute.peerId
        }
      }
    }
    deps.logger.debug(
      { destination, tenantId, assetId },
      'no static route found'
    )
    return undefined
  }

  function getOwnAddress(deps: RouterServiceDependencies): string {
    return deps.staticIlpAddress
  }

  return {
    logger: log,
    addStaticRoute: (destination, peerId, tenantId, assetId) =>
      addStaticRoute(deps, destination, peerId, tenantId, assetId),
    removeStaticRoute: (destination, peerId, tenantId, assetId) =>
      removeStaticRoute(deps, destination, peerId, tenantId, assetId),
    getNextHop: (destination, tenantId, assetId) =>
      getNextHop(deps, destination, tenantId, assetId),
    getOwnAddress: () => getOwnAddress(deps)
  }
}
