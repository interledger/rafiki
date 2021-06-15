import { serve as ildcpServe } from 'ilp-protocol-ildcp'
import { RafikiContext } from '../rafiki'

/**
 * Intercepts and handles peer.config messages otherwise passes the request onto next.
 */
export function createIldcpProtocolController(serverAddress: string) {
  return async function ildcp(ctx: RafikiContext): Promise<void> {
    const {
      services: { logger },
      request,
      response,
      accounts: { incoming }
    } = ctx
    if (request.prepare.destination !== 'peer.config') {
      ctx.throw('Invalid address in ILDCP request')
    }

    const clientAddress = await ctx.services.accounts.getAddress(
      incoming.accountId
    )
    if (!clientAddress) {
      logger.warn('received ILDCP request for peer without an address', {
        peerId: incoming.accountId
      })
      ctx.throw('ILDCP request from peer without configured address')
    }

    // TODO: Ensure we get at least length > 0
    //const serverAddress = router.getAddresses(SELF_PEER_ID)[0]
    //const clientAddress = router.getAddresses(id)[0]

    logger.info('responding to ILDCP request from child', {
      peerId: incoming.accountId,
      address: clientAddress
    })

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
