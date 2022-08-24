import * as _ from 'lodash'
import { CONFIG } from './parse_config'
import type { SeedInstance, Peering } from './parse_config'
import { createPeer, addPeerLiquidity } from './requesters'
import { v4 } from 'uuid'

async function setupFromSeed(config: SeedInstance): Promise<void> {
  const responses = await Promise.all(
    _.map(config.peers, async (peer: Peering) => {
      const peerResponse = await createPeer(
        peer.peerIlpAddress,
        peer.peerUrl,
        peer.asset,
        peer.scale
      ).then((response) => response.peer)
      if (!peerResponse) {
        throw new Error('peer response not defined')
      }
      const transferUid = v4()
      const liquidity = await addPeerLiquidity(
        config.self.graphqlUrl,
        peerResponse.id,
        peer.initialLiquidity.toString(),
        transferUid
      )
      return [peerResponse, liquidity]
    })
  )
  console.log(JSON.stringify(responses, null, 2))
}

setupFromSeed(CONFIG).then((data) => {
  console.log(data)
})
