import { Peer } from '../ilp-route-manager/peer'
import { IncomingRoute } from '../types/routing'

describe('peer', function () {
  let peer: Peer

  beforeEach(function () {
    peer = new Peer({
      peerId: 'harry',
      relation: 'peer'
    })
  })

  test('can insert a route', function () {
    const incomingRoute: IncomingRoute = {
      peer: 'harry',
      prefix: 'g.harry',
      path: []
    }
    expect(peer.getPrefix('g.harry')).not.toBeDefined()

    peer.insertRoute(incomingRoute)

    expect(peer.getPrefix('g.harry')).toEqual(incomingRoute)
  })

  test('can delete a route', function () {
    const incomingRoute: IncomingRoute = {
      peer: 'harry',
      prefix: 'g.harry',
      path: []
    }
    peer.insertRoute(incomingRoute)
    expect(peer.getPrefix('g.harry')).toBeDefined()

    peer.deleteRoute('g.harry')

    expect(peer.getPrefix('g.harry')).not.toBeDefined()
  })

  test('can get a route', function () {
    peer.insertRoute({
      peer: 'harry',
      prefix: 'g.harry',
      path: []
    })
    peer.insertRoute({
      peer: 'harry',
      prefix: 'g.sally',
      path: []
    })

    expect(peer.getPrefix('g.harry')).toEqual({
      peer: 'harry',
      prefix: 'g.harry',
      path: []
    })
    expect(peer.getPrefix('g.sally')).toEqual({
      peer: 'harry',
      prefix: 'g.sally',
      path: []
    })
  })
})
