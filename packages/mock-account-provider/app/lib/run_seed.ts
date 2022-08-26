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
        peer.initialLiquidity.toString(),
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
      await mockAccounts.create(account.id, account.name)
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
        account.url,
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
  const envVarStrings = _.map(accountResponses, (response) => {
    if (!response.paymentPointer) {
      return
    }
    const envVarName = (
      _.find(config.accounts, (account) => {
        if (response.paymentPointer) {
          return account.name === response.paymentPointer.publicName
        }
      }) as Account
    ).postmanEnvVar
    return `${envVarName}: http://localhost:${CONFIG.self.openPaymentPublishedPort}/${response.paymentPointer.id}`
  })
  console.log(envVarStrings.join('\n'))
}

export async function runSeed(): Promise<void> {
  console.log('calling run_seed')
  return setupFromSeed(CONFIG)
}
