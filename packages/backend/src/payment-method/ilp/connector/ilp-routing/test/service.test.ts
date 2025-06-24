import { createRouterService, RouterService } from '../service'
import { createInMemoryDataStore } from '../../../../../middleware/cache/data-stores/in-memory'
import { Config } from '../../../../../config/app'
import { createTestApp, TestContainer } from '../../../../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../../../..'
import { AppServices } from '../../../../../app'
import { truncateTables } from '../../../../../tests/tableManager'

describe('RouterService', (): void => {
  const tenantId1 = 'tenant-1'
  const tenantId2 = 'tenant-2'
  const peerId1 = 'peer-1'
  const peerId2 = 'peer-2'
  const peerId3 = 'peer-3'
  const assetId1 = 'asset-1'
  const assetId2 = 'asset-2'
  const prefix = 'g.test1'

  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let routerService: RouterService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    routerService = await deps.use('routerService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
    const staticRoutesStore = await deps.use('staticRoutesStore')
    await staticRoutesStore.deleteAll()
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('addStaticRoute', (): void => {
    test('adds route for specific tenant and asset', async (): Promise<void> => {
      await routerService.addStaticRoute(prefix, peerId1, tenantId1, assetId1)
      
      const nextHop = await routerService.getNextHop(prefix, tenantId1, assetId1)
      expect(nextHop).toBe(peerId1)
    })

    test('adds multiple peers for same prefix, tenant and asset', async (): Promise<void> => {
      await routerService.addStaticRoute(prefix, peerId1, tenantId1, assetId1)
      await routerService.addStaticRoute(prefix, peerId2, tenantId1, assetId1)
      
      const nextHop = await routerService.getNextHop(prefix, tenantId1, assetId1)
      expect([peerId1, peerId2]).toContain(nextHop)
    })

    test('isolates routes between tenants', async (): Promise<void> => {
      await routerService.addStaticRoute(prefix, peerId1, tenantId1, assetId1)
      await routerService.addStaticRoute(prefix, peerId2, tenantId2, assetId1)
      
      const nextHop1 = await routerService.getNextHop(prefix, tenantId1, assetId1)
      const nextHop2 = await routerService.getNextHop(prefix, tenantId2, assetId1)
      
      expect(nextHop1).toBe(peerId1)
      expect(nextHop2).toBe(peerId2)
    })

    test('isolates routes between assets', async (): Promise<void> => {
      await routerService.addStaticRoute(prefix, peerId1, tenantId1, assetId1)
      await routerService.addStaticRoute(prefix, peerId2, tenantId1, assetId2)
      
      const nextHop1 = await routerService.getNextHop(prefix, tenantId1, assetId1)
      const nextHop2 = await routerService.getNextHop(prefix, tenantId1, assetId2)
      
      expect(nextHop1).toBe(peerId1)
      expect(nextHop2).toBe(peerId2)
    })

    test('allows same peer for different assets', async (): Promise<void> => {
      await routerService.addStaticRoute(prefix, peerId1, tenantId1, assetId1)
      await routerService.addStaticRoute(prefix, peerId1, tenantId1, assetId2)
      
      const nextHop1 = await routerService.getNextHop(prefix, tenantId1, assetId1)
      const nextHop2 = await routerService.getNextHop(prefix, tenantId1, assetId2)
      
      expect(nextHop1).toBe(peerId1)
      expect(nextHop2).toBe(peerId1)
    })
  })

  describe('removeStaticRoute', (): void => {
    test('removes route for specific tenant and asset', async (): Promise<void> => {
      await routerService.addStaticRoute(prefix, peerId1, tenantId1, assetId1)
      await routerService.removeStaticRoute(prefix, peerId1, tenantId1, assetId1)
      
      const nextHop = await routerService.getNextHop(prefix, tenantId1, assetId1)
      expect(nextHop).toBeUndefined()
    })

    test('removes only specific peer from tenant and asset', async (): Promise<void> => {
      await routerService.addStaticRoute(prefix, peerId1, tenantId1, assetId1)
      await routerService.addStaticRoute(prefix, peerId2, tenantId1, assetId1)
      await routerService.removeStaticRoute(prefix, peerId1, tenantId1, assetId1)
      
      const nextHop = await routerService.getNextHop(prefix, tenantId1, assetId1)
      expect(nextHop).toBe(peerId2)
    })

    test('handles removing non-existent route gracefully', async (): Promise<void> => {
      await routerService.removeStaticRoute(prefix, peerId1, tenantId1, assetId1)
      
      const nextHop = await routerService.getNextHop(prefix, tenantId1, assetId1)
      expect(nextHop).toBeUndefined()
    })

    test('removes only specific asset route when peer has multiple assets', async (): Promise<void> => {
      await routerService.addStaticRoute(prefix, peerId1, tenantId1, assetId1)
      await routerService.addStaticRoute(prefix, peerId1, tenantId1, assetId2)
      await routerService.removeStaticRoute(prefix, peerId1, tenantId1, assetId1)
      
      const nextHop1 = await routerService.getNextHop(prefix, tenantId1, assetId1)
      const nextHop2 = await routerService.getNextHop(prefix, tenantId1, assetId2)
      
      expect(nextHop1).toBeUndefined()
      expect(nextHop2).toBe(peerId1)
    })

    test('does not affect other tenants when removing route', async (): Promise<void> => {
      await routerService.addStaticRoute(prefix, peerId1, tenantId1, assetId1)
      await routerService.addStaticRoute(prefix, peerId1, tenantId2, assetId1)
      await routerService.removeStaticRoute(prefix, peerId1, tenantId1, assetId1)
      
      const nextHop2 = await routerService.getNextHop(prefix, tenantId2, assetId1)
      expect(nextHop2).toBe(peerId1)
    })
  })

  describe('getNextHop - longest prefix match', (): void => {
    test('finds next hop for exact prefix match', async (): Promise<void> => {
      await routerService.addStaticRoute(prefix, peerId1, tenantId1, assetId1)
      
      const nextHop = await routerService.getNextHop(prefix, tenantId1, assetId1)
      const sameNextHop = await routerService.getNextHop(prefix, tenantId1)
      expect(nextHop).toBe(peerId1)
      expect(nextHop).toBe(sameNextHop)
    })

    test('finds next hop for longer destination using longest prefix match', async (): Promise<void> => {
      await routerService.addStaticRoute(prefix, peerId1, tenantId1, assetId1)
      
      const nextHop = await routerService.getNextHop(`${prefix}.sub`, tenantId1, assetId1)
      const sameNextHop = await routerService.getNextHop(`${prefix}.sub`, tenantId1)
      expect(nextHop).toBe(peerId1)
      expect(nextHop).toBe(sameNextHop)
    })

    test('prefers longer prefix over shorter prefix', async (): Promise<void> => {
      await routerService.addStaticRoute('g', peerId1, tenantId1, assetId1)
      await routerService.addStaticRoute('g.test1', peerId2, tenantId1, assetId1)
      
      const nextHop = await routerService.getNextHop('g.test1.sub', tenantId1, assetId1)
      const sameNextHop = await routerService.getNextHop('g.test1.sub', tenantId1)
      expect(nextHop).toBe(peerId2)
      expect(nextHop).toBe(sameNextHop)
    })

    test('returns undefined for unknown destination', async (): Promise<void> => {
      const nextHop = await routerService.getNextHop('g.unknown', tenantId1, assetId1)
      const sameNextHop = await routerService.getNextHop('g.unknown', tenantId1)
      expect(nextHop).toBeUndefined()
      expect(nextHop).toBe(sameNextHop)
    })

    test('isolates routing between tenants', async (): Promise<void> => {
      await routerService.addStaticRoute(prefix, peerId1, tenantId1, assetId1)
      await routerService.addStaticRoute(prefix, peerId2, tenantId2, assetId1)
      
      const nextHop1 = await routerService.getNextHop(prefix, tenantId1, assetId1)
      const nextHop2 = await routerService.getNextHop(prefix, tenantId2, assetId1)
      
      expect(nextHop1).toBe(peerId1)
      expect(nextHop2).toBe(peerId2)
    })

    test('returns undefined for destination of different tenant', async (): Promise<void> => {
      await routerService.addStaticRoute(prefix, peerId1, tenantId1, assetId1)
      const nextHop = await routerService.getNextHop(prefix, tenantId2, assetId1)
      const sameNextHop = await routerService.getNextHop(prefix, tenantId2)

      expect(nextHop).toBeUndefined()
      expect(nextHop).toBe(sameNextHop)
    })

    test('handles multiple peers for same prefix and asset (random selection)', async (): Promise<void> => {
      await routerService.addStaticRoute(prefix, peerId1, tenantId1, assetId1)
      await routerService.addStaticRoute(prefix, peerId2, tenantId1, assetId1)
      await routerService.addStaticRoute(prefix, peerId3, tenantId1, assetId1)
      
      const nextHop = await routerService.getNextHop(prefix, tenantId1, assetId1)
      expect([peerId1, peerId2, peerId3]).toContain(nextHop)
    })
  })

  describe('getNextHop - asset filtering', (): void => {
    test('filters routes by asset when multiple assets exist', async (): Promise<void> => {
      await routerService.addStaticRoute(prefix, peerId1, tenantId1, assetId1)
      await routerService.addStaticRoute(prefix, peerId2, tenantId1, assetId2)
      
      const nextHop1 = await routerService.getNextHop(prefix, tenantId1, assetId1)
      const nextHop2 = await routerService.getNextHop(prefix, tenantId1, assetId2)
      
      expect(nextHop1).toBe(peerId1)
      expect(nextHop2).toBe(peerId2)
    })

    test('returns undefined when asset does not match', async (): Promise<void> => {
      await routerService.addStaticRoute(prefix, peerId1, tenantId1, assetId1)
      
      const nextHop = await routerService.getNextHop(prefix, tenantId1, assetId2)
      expect(nextHop).toBeUndefined()
    })

    test('works without assetId parameter', async (): Promise<void> => {
      await routerService.addStaticRoute(prefix, peerId1, tenantId1, assetId1)
      
      const nextHop = await routerService.getNextHop(prefix, tenantId1)
      expect(nextHop).toBe(peerId1)
    })

    test('handles multiple assets for same peer', async (): Promise<void> => {
      await routerService.addStaticRoute(prefix, peerId1, tenantId1, assetId1)
      await routerService.addStaticRoute(prefix, peerId1, tenantId1, assetId2)
      
      const nextHop1 = await routerService.getNextHop(prefix, tenantId1, assetId1)
      const nextHop2 = await routerService.getNextHop(prefix, tenantId1, assetId2)
      
      expect(nextHop1).toBe(peerId1)
      expect(nextHop2).toBe(peerId1)
    })
  })

  describe('getNextHop - edge cases', (): void => {
    test('handles empty destination', async (): Promise<void> => {
      const nextHop = await routerService.getNextHop('', tenantId1, assetId1)
      const sameNextHop = await routerService.getNextHop('', tenantId1)

      expect(nextHop).toBeUndefined()
      expect(nextHop).toBe(sameNextHop)
    })

    test('handles single segment destination', async (): Promise<void> => {
      await routerService.addStaticRoute('g', peerId1, tenantId1, assetId1)
      
      const nextHop = await routerService.getNextHop('g', tenantId1, assetId1)
      const sameNextHop = await routerService.getNextHop('g', tenantId1)

      expect(nextHop).toBe(peerId1)
      expect(nextHop).toBe(sameNextHop)
    })

    test('handles case where no prefix matches with asset', async (): Promise<void> => {
      await routerService.addStaticRoute('g.test1', peerId1, tenantId1, assetId1)
      
      const nextHop = await routerService.getNextHop('h.test1', tenantId1, assetId1)
      expect(nextHop).toBeUndefined()
    })
  })

  describe('getOwnAddress', (): void => {
    test('returns configured ILP address', (): void => {
      const ownAddress = routerService.getOwnAddress()
      expect(ownAddress).toBe('test.rafiki')
    })
  })
}) 