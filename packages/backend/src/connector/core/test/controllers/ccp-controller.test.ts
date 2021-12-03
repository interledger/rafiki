describe.skip('CCP Rule', function () {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  test('', function () {})
})
/*
import { serializeIlpPrepare } from 'ilp-packet'
import {
  serializeCcpResponse,
  deserializeCcpRouteControlRequest,
  deserializeCcpRouteUpdateRequest
} from 'ilp-protocol-ccp'
import { createContext } from '../../utils'
import { HttpContext } from '../../rafiki'
import { createCcpProtocolController } from '../../controllers/ccp-protocol'
import {
  IlpPrepareFactory,
  RouteUpdatePreparePacketFactory,
  RouteControlPreparePacketFactory,
  PeerFactory,
  RafikiServicesFactory
} from '../../factories'
import { ZeroCopyIlpPrepare } from '../../middleware/ilp-packet'

describe('CCP Rule', function () {
  const alice = PeerFactory.build()
  const bob = PeerFactory.build()
  const services = RafikiServicesFactory.build({
    router: {
      getAddresses: jest.fn(),
      getPeerForAddress: jest.fn(),
      getRoutingTable: jest.fn(),
      handleRouteControl: jest.fn().mockResolvedValue(undefined),
      handleRouteUpdate: jest.fn().mockResolvedValue(undefined)
    }
  })
  const ctx = createContext<unknown, HttpContext>()
  ctx.services = services
  ctx.peers = {
    get incoming() {
      return Promise.resolve(alice)
    },
    get outgoing() {
      return Promise.resolve(bob)
    }
  }
  const controller = createCcpProtocolController()
  test('gives router ccp route update requests and returns a CcpResponse for route update request', async () => {
    const routeUpdate = RouteUpdatePreparePacketFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(routeUpdate)
    ctx.request.rawPrepare = serializeIlpPrepare(routeUpdate)

    await expect(controller(ctx)).resolves.toBeUndefined()

    expect(services.logger.trace).toHaveBeenCalledWith(
      {
        request: ctx.request.prepare
      },
      'received peer.route.update'
    )
    expect(ctx.response.rawReply).toEqual(serializeCcpResponse())
    expect(services.router.handleRouteUpdate).toHaveBeenCalledWith(
      alice.id,
      deserializeCcpRouteUpdateRequest(ctx.request.rawPrepare)
    )
  })
  test('gives router ccp route control requests and returns a CcpResponse for route control request', async () => {
    const routeControl = RouteControlPreparePacketFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(routeControl)
    ctx.request.rawPrepare = serializeIlpPrepare(routeControl)

    await expect(controller(ctx)).resolves.toBeUndefined()

    expect(services.logger.trace).toHaveBeenCalledWith(
      {
        request: ctx.request.prepare
      },
      'received peer.route.control'
    )
    expect(ctx.response.rawReply).toEqual(serializeCcpResponse())
    expect(services.router.handleRouteControl).toHaveBeenCalledWith(
      alice.id,
      deserializeCcpRouteControlRequest(ctx.request.rawPrepare)
    )
  })
  test('throws error for non ccp related messages', async () => {
    const prepare = IlpPrepareFactory.build()
    ctx.request.prepare = new ZeroCopyIlpPrepare(prepare)
    ctx.request.rawPrepare = serializeIlpPrepare(prepare)

    await expect(controller(ctx)).rejects.toThrowError(
      'Unrecognized CCP message'
    )
  })
})
*/
