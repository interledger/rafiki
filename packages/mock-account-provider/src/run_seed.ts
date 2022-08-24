import * as _ from 'lodash'
import { CONFIG } from './parse_config'
import type { SeedInstance, Peering } from './parse_config'
import { createPeer } from './requesters'

async function setupFromSeed(config: SeedInstance): Promise<void> {
  const peers = await Promise.all(
    _.map(config.peers, (peer: Peering) => {
      return createPeer(
        config.self.graphqlUrl,
        peer.peerIlpAddress,
        peer.peerUrl,
        peer.asset,
        peer.scale
      )
    })
  )
  console.log(JSON.stringify(peers, null, 2))
}

setupFromSeed(CONFIG).then((data) => {
  console.log(data)
})
