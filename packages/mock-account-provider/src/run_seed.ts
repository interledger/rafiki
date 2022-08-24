import * as _ from 'lodash'
import { CONFIG } from './parse_config'
import type { SeedInstance, Peering } from './parse_config'
import { createPeer, addPeerLiquidity } from './requesters'
import { v4 } from 'uuid'

async function setupFromSeed(config: SeedInstance): Promise<void> {
  const responses = await Promise.all(
    _.map(config.peers, async (peer: Peering): Promise<Array<object>> => {
      const peerResponse = await createPeer(
        config.self.graphqlUrl,
        peer.peerIlpAddress,
        peer.peerUrl,
        peer.asset,
        peer.scale
      )
      const transferUid = v4()
      const liquidity = await addPeerLiquidity(
        config.self.graphqlUrl,
        peerResponse.data.createPeer.peer.id,
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
