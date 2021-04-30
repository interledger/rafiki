import { createContext } from '../../utils'
import { createPeerMiddleware } from '../../middleware/peer'
import { IlpPrepareFactory } from '../../factories'
import { PeerFactory, RafikiServicesFactory } from '../../factories/test'
import { RafikiContext } from '../../rafiki'
import { InMemoryPeers } from '../../services'
import { ZeroCopyIlpPrepare } from '../../middleware/ilp-packet'

describe('Peer Middleware', () => {
  const incomingPeerInfo = PeerFactory.build({ id: 'incomingPeer' })
  const outgoingPeerInfo = PeerFactory.build({ id: 'outgoingPeer' })
  const peers = new InMemoryPeers()
  const router = {
    getAddresses: jest.fn(),
    getPeerForAddress: jest
      .fn()
      .mockImplementation((_address: string) => 'outgoingPeer'),
    getRoutingTable: jest.fn(),
    handleRouteControl: jest.fn(),
    handleRouteUpdate: jest.fn()
  }
  const rafikiServices = RafikiServicesFactory.build({ router }, { peers })

  beforeAll(async () => {
    await peers.add(incomingPeerInfo)
    await peers.add(outgoingPeerInfo)
  })

  test('the default getOutgoingPeer asks the router for the next peer', async () => {
    const middleware = createPeerMiddleware()
    const next = jest.fn()
    const ctx = createContext<unknown, RafikiContext>()
    ctx.services = rafikiServices
    ctx.request.prepare = new ZeroCopyIlpPrepare(
      IlpPrepareFactory.build({ destination: 'test.rafiki.outgoingPeer' })
    )

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    const outgoingPeer = await ctx.peers.outgoing

    expect(router.getPeerForAddress).toHaveBeenCalled()
    expect(outgoingPeer).toEqual(await peers.get('outgoingPeer'))
  })

  test('the default getIncomingPeer looks for the user on the ctx state', async () => {
    const middleware = createPeerMiddleware()
    const next = jest.fn()
    const ctx = createContext<unknown, RafikiContext>()
    ctx.services = rafikiServices
    ctx.state.user = { sub: 'incomingPeer' }
    ctx.request.prepare = new ZeroCopyIlpPrepare(IlpPrepareFactory.build())

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    const incomingPeer = await ctx.peers.incoming

    expect(incomingPeer).toEqual(await peers.get('incomingPeer'))
  })

  test('correctly binds functions to get peers', async () => {
    const ctx = createContext<unknown, RafikiContext>()
    const next = jest.fn()
    ctx.services = rafikiServices
    ctx.state.user = { sub: 'incomingPeer' }
    const middleware = createPeerMiddleware({
      getIncomingPeerId: (_ctx) => 'outgoingPeer',
      getOutgoingPeerId: (_ctx) => 'incomingPeer'
    })

    await expect(middleware(ctx, next)).resolves.toBeUndefined()

    expect(await ctx.peers.incoming).toEqual(await peers.get('outgoingPeer'))
    expect(await ctx.peers.outgoing).toEqual(await peers.get('incomingPeer'))
  })
})
