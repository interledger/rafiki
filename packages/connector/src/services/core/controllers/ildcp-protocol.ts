import { serve as ildcpServe } from 'ilp-protocol-ildcp'
import { SELF_PEER_ID } from '../constants'
import { RafikiContext } from '../rafiki'

/**
 * Intercepts and handles peer.config messages otherwise passes the request onto next.
 */
export function createIldcpProtocolController () {
  return async function ildcp (ctx: RafikiContext): Promise<void> {
    const {
      services: { logger, router, accounts },
      request,
      response,
      peers: { incoming }
    } = ctx
    if (request.prepare.destination === 'peer.config') {
      const peer = await incoming
      const { id, relation } = peer
      const { assetCode, assetScale } = await accounts.get(id)
      if (relation !== 'child') {
        logger.warn('received ILDCP request for peer that is not a child', {
          peerId: id,
          relation
        })
        throw new Error("Can't generate address for a peer that isn\t a child.")
      }

      // TODO: Ensure we get at least length > 0
      const serverAddress = router.getAddresses(SELF_PEER_ID)[0]
      const clientAddress = router.getAddresses(id)[0]

      logger.info('responding to ILDCP request from child', {
        peerId: id,
        address: clientAddress
      })

      // TODO: Remove unnecessary serialization from ILDCP module
      response.rawReply = await ildcpServe({
        requestPacket: request.rawPrepare,
        handler: () =>
          Promise.resolve({
            clientAddress,
            assetScale,
            assetCode
          }),
        serverAddress
      })
    } else {
      ctx.throw('Invalid address in ILDCP request')
    }
  }
}
