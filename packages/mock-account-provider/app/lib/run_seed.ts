import * as _ from 'lodash'
import { CONFIG } from './parse_config'
import type { SeedInstance, Account, Peering } from './parse_config'
import {
  createPeer,
  addPeerLiquidity,
  createPaymentPointer
} from './requesters'
import { v4 } from 'uuid'
import { mockAccounts } from './accounts.server'

export async function setupFromSeed(config: SeedInstance): Promise<void> {
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
        peer.initialLiquidity,
        transferUid
      )
      return [peerResponse, liquidity]
    })
  )

  console.log(JSON.stringify(peerResponses, null, 2))

  // Clear the accounts before seeding.
  await mockAccounts.clearAccounts()

  const accountResponses = await Promise.all(
    _.map(config.accounts, async (account: Account) => {
      await mockAccounts.create(
        account.id,
        account.name,
        account.asset,
        account.scale
      )
      if (account.initialBalance) {
        await mockAccounts.credit(
          account.id,
          BigInt(account.initialBalance),
          false
        )
      }
      const pp = await createPaymentPointer(
        config.self.graphqlUrl,
        account.name,
        `https://${CONFIG.self.hostname}/${account.path}`,
        account.asset,
        account.scale
      )

      await mockAccounts.setPaymentPointer(
        account.id,
        pp.paymentPointer?.id,
        pp.paymentPointer?.url
      )

      return pp
    })
  )
  console.log(JSON.stringify(accountResponses, null, 2))
  const envVarStrings = _.map(config.accounts, (account) => {
    return `${account.postmanEnvVar}: http://localhost:${CONFIG.self.openPaymentPublishedPort}/${account.path} hostname: ${CONFIG.self.hostname}`
  })
  console.log(envVarStrings.join('\n'))
}

export async function runSeed(): Promise<void> {
  console.log('calling run_seed')
  return setupFromSeed(CONFIG)
}
