import { Router } from '..'

describe('ilp-router', function () {
  describe('routes', function () {
    let router: Router

    beforeEach(function () {
      router = new Router()
      router.setOwnAddress('test.rafiki')
    })

    test('can add a route for a peer', function () {
      router.addRoute('g.harry', {
        nextHop: 'harry',
        path: []
      })

      const table = router.getRoutingTable()

      expect(table.keys().includes('g.harry')).toBe(true)
      expect(table.resolve('g.harry.sally')).toEqual({
        nextHop: 'harry',
        path: []
      })
    })

    test('can remove a route for a peer', function () {
      router.addRoute('g.harry', {
        nextHop: 'harry',
        path: []
      })

      router.removeRoute('g.harry')

      const table = router.getRoutingTable()
      expect(table.keys().includes('g.harry')).toBe(false)
      expect(table.resolve('g.harry.sally')).not.toBeDefined()
    })
  })

  describe('nextHop', function () {
    let router: Router

    beforeEach(function () {
      router = new Router()
      router.setOwnAddress('test.rafiki')
      router.addRoute('g.harry', {
        nextHop: 'harry',
        path: []
      })
    })

    test('returns peerId if nextHop called for route to a peer', function () {
      const nextHop = router.nextHop('g.harry.met.sally')
      expect(nextHop).toEqual('harry')
    })

    test("throws an error if can't route request", function () {
      expect(() => router.nextHop('g.sally')).toThrow()
    })
  })

  describe('weighting', function () {
    /* TODO */
  })

  // TODO: Need to add functionality to check that adding a route propagates to the forwardingRoutingTable or perhaps the Route Manager should handle that?
})
