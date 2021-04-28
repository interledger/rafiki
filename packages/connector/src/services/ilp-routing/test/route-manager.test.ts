/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Router } from '..'
import { RouteManager } from '../ilp-route-manager'
import { Peer } from '../ilp-route-manager/peer'

describe('ilp-route-manager', function () {
  let router: Router

  beforeEach(function () {
    router = new Router()
    router.setOwnAddress('test.rafiki')
  })

  describe('instantiation', function () {
    test('can be instantiated', function () {
      const routeManager = new RouteManager(router)

      expect(routeManager).toBeInstanceOf(RouteManager)
    })
  })

  describe('peer', function () {
    test('can add a peer', function () {
      const routeManager = new RouteManager(router)

      routeManager.addPeer('harry', 'peer')

      const peer = routeManager.getPeer('harry')
      expect(routeManager.getPeer('harry')).toBeDefined()
      expect(peer).toBeInstanceOf(Peer)
    })

    test('can remove a peer', function () {
      const routeManager = new RouteManager(router)

      routeManager.removePeer('harry')

      expect(routeManager.getPeer('harry')).not.toBeDefined()
    })

    test('can get all peers', function () {
      const routeManager = new RouteManager(router)

      routeManager.addPeer('harry', 'peer')

      const peers = routeManager.getPeerList()
      expect(peers).toEqual(['harry'])
    })
  })

  describe('route', function () {
    let routeManager: RouteManager
    let peer: Peer | undefined

    beforeEach(function () {
      routeManager = new RouteManager(router)
      routeManager.addPeer('harry', 'peer')
      peer = routeManager.getPeer('harry')
    })

    describe('adding', function () {
      test('adding a route adds it to peer routing table', function () {
        routeManager.addRoute({
          peer: 'harry',
          prefix: 'g.harry',
          path: []
        })

        const route = peer!.getPrefix('g.harry')

        expect(route).toEqual({
          peer: 'harry',
          prefix: 'g.harry',
          path: []
        })
      })

      test('adding a better route adds it to the routingTable', function () {
        routeManager.addPeer('mary', 'child')
        routeManager.addRoute({
          peer: 'harry',
          prefix: 'g.nick',
          path: ['g.potter']
        })

        routeManager.addRoute({
          peer: 'mary',
          prefix: 'g.nick',
          path: []
        })

        const nextHop = router.nextHop('g.nick')
        expect(nextHop).toEqual('mary')
      })

      test('adding a worse route does not update routing table', function () {
        routeManager.addPeer('mary', 'child')
        routeManager.addRoute({
          peer: 'harry',
          prefix: 'g.harry',
          path: []
        })

        routeManager.addRoute({
          peer: 'mary',
          prefix: 'g.harry',
          path: ['g.turtle']
        })

        const nextHop = router.nextHop('g.harry')
        expect(nextHop).toEqual('harry')
      })
    })

    // Section for testing weighting stuff
    describe('weighting', function () {
      /* TODO */
    })

    test('removing a route removes from peer routing table', function () {
      routeManager.addRoute({
        peer: 'harry',
        prefix: 'g.harry',
        path: []
      })

      routeManager.removeRoute('harry', 'g.harry')

      const route = peer!.getPrefix('g.harry')
      expect(route).not.toBeDefined()
    })

    test('does not add a route for a peer that does not exist', function () {
      routeManager.addRoute({
        peer: 'mary',
        prefix: 'g.harry',
        path: []
      })

      const nextHop = router.getRoutingTable().get('g.harry')
      expect(nextHop).not.toBeDefined()
    })

    test('removing a peer should remove all its routes from the routing table', function () {
      routeManager.addRoute({
        peer: 'harry',
        prefix: 'g.harry',
        path: []
      })
      expect(router.getRoutingTable().get('g.harry')).toBeDefined()

      routeManager.removePeer('harry')

      expect(router.getRoutingTable().get('g.harry')).not.toBeDefined()
    })
  })
})
