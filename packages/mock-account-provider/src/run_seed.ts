import * as _ from 'lodash'
import { CONFIG } from './parse_config'
import type { SeedInstance, Account, Peering } from './parse_config'
import { createPeer, addPeerLiquidity, createAccount } from './requesters'
import { v4 } from 'uuid'

async function setupFromSeed(config: SeedInstance): Promise<void> {
  const peerResponses = await Promise.all(
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
  console.log(JSON.stringify(peerResponses, null, 2))
  const accountResponses = await Promise.all(
    _.map(config.accounts, async (account: Account) => {
      const createAccountResponse = await createAccount(
        config.self.graphqlUrl,
        account.name,
        account.asset,
        account.scale.toString()
      )
      return createAccountResponse
    })
  )
  console.log(JSON.stringify(accountResponses, null, 2))
}

setupFromSeed(CONFIG).then((data) => {
  console.log(data)
})
