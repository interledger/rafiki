import { RafikiContext, RafikiMiddleware } from '../rafiki'
import { Peer } from '../services/peers'
import { AuthState } from './auth'

export interface PeerMiddlewareOptions {
  getIncomingPeerId?: (ctx: RafikiContext<AuthState>) => string
  getOutgoingPeerId?: (ctx: RafikiContext) => string
}

const defaultGetIncomingPeerId = (ctx: RafikiContext<AuthState>): string => {
  ctx.assert(ctx.state.user && ctx.state.user.sub, 401)
  return ctx.state.user!.sub! // Waiting on Sir Anders (https://github.com/microsoft/TypeScript/pull/32695)
}

const defaultGetOutgoingPeerId = (ctx: RafikiContext): string => {
  ctx.assert(ctx.request.prepare.destination, 500)
  return ctx.services.router.getPeerForAddress(ctx.request.prepare.destination)
}

const defaultMiddlewareOptions: PeerMiddlewareOptions = {
  getIncomingPeerId: defaultGetIncomingPeerId,
  getOutgoingPeerId: defaultGetOutgoingPeerId
}

export function createPeerMiddleware(
  config: PeerMiddlewareOptions = defaultMiddlewareOptions
): RafikiMiddleware {
  const getIncomingPeerId =
    config && config.getIncomingPeerId
      ? config.getIncomingPeerId
      : defaultGetIncomingPeerId
  const getOutgoingPeerId =
    config && config.getOutgoingPeerId
      ? config.getOutgoingPeerId
      : defaultGetOutgoingPeerId

  return async function peer(
    ctx: RafikiContext<AuthState>,
    next: () => Promise<any>
  ): Promise<void> {
    let incomingPeer: Promise<Peer> | undefined
    let outgoingPeer: Promise<Peer> | undefined
    ctx.peers = {
      get incoming(): Promise<Peer> {
        if (incomingPeer) return incomingPeer
        incomingPeer = ctx.services.peers.get(getIncomingPeerId(ctx))
        return incomingPeer
      },
      get outgoing(): Promise<Peer> {
        if (outgoingPeer) return outgoingPeer
        outgoingPeer = ctx.services.peers.get(getOutgoingPeerId(ctx))
        return outgoingPeer
      }
    }
    await next()
  }
}
