import { serve as ildcpServe } from 'ilp-protocol-ildcp'
import { ILPMiddleware, ILPContext } from '../rafiki'

/**
 * Intercepts and handles peer.config messages otherwise passes the request onto next.
 */
export function createIldcpMiddleware(serverAddress: string): ILPMiddleware {
  return async function ildcp(
    ctx: ILPContext,
    next: () => Promise<void>
  ): Promise<void> {
    const {
      services: { logger },
      request,
      response,
      accounts: { incoming }
    } = ctx
    if (request.prepare.destination !== 'peer.config') {
      await next()
      return
    }

    const clientAddress = incoming.staticIlpAddress
    if (!clientAddress) {
      logger.error(
        {
          peerId: incoming.id
        },
        'received ILDCP request for peer without an address'
      )
      ctx.throw(500, 'not a peer account')
    }

    // TODO: Ensure we get at least length > 0
    //const serverAddress = router.getAddresses(SELF_PEER_ID)[0]
    //const clientAddress = router.getAddresses(id)[0]

    logger.info(
      {
        peerId: incoming.id,
        address: clientAddress
      },
      'responding to ILDCP request from child'
    )

    // TODO: Remove unnecessary serialization from ILDCP module
    response.rawReply = await ildcpServe({
      requestPacket: request.rawPrepare,
      handler: () =>
        Promise.resolve({
          clientAddress,
          assetScale: incoming.asset.scale,
          assetCode: incoming.asset.code
        }),
      serverAddress
    })
  }
}
