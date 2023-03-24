import { CONFIG, type Config, type Account, type Peering } from './parse_config'
import {
  createAsset,
  createPeer,
  addPeerLiquidity,
  createPaymentPointer,
  createPaymentPointerKey
} from './requesters'
import { v4 } from 'uuid'
import { mockAccounts } from './accounts.server'
import { generateJwk } from '@interledger/http-signature-utils'

export async function setupFromSeed(config: Config): Promise<void> {
  const { asset } = await createAsset(
    config.seed.asset.code,
    config.seed.asset.scale
  )
  if (!asset) {
    throw new Error('asset not defined')
  }
  console.log(JSON.stringify(asset, null, 2))
  const peerResponses = await Promise.all(
    config.seed.peers.map(async (peer: Peering) => {
      const peerResponse = await createPeer(
        peer.peerIlpAddress,
        peer.peerUrl,
        asset.id,
        peer.name
      ).then((response) => response.peer)
      if (!peerResponse) {
        throw new Error('peer response not defined')
      }
      const transferUid = v4()
      const liquidity = await addPeerLiquidity(
        config.seed.self.graphqlUrl,
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
    config.seed.accounts.map(async (account: Account) => {
      await mockAccounts.create(
        account.id,
        account.name,
        asset.code,
        asset.scale
      )
      if (account.initialBalance) {
        await mockAccounts.credit(
          account.id,
          BigInt(account.initialBalance),
          false
        )
      }
      const paymentPointer = await createPaymentPointer(
        config.seed.self.graphqlUrl,
        account.name,
        `https://${CONFIG.seed.self.hostname}/${account.path}`,
        asset.id
      )

      await mockAccounts.setPaymentPointer(
        account.id,
        paymentPointer.id,
        paymentPointer.url
      )

      await createPaymentPointerKey({
        paymentPointerId: paymentPointer.id,
        jwk: generateJwk({
          keyId: `keyid-${account.id}`,
          privateKey: config.key
        })
      })

      return paymentPointer
    })
  )
  console.log(JSON.stringify(accountResponses, null, 2))
  const envVarStrings = config.seed.accounts.map((account) => {
    return `${account.postmanEnvVar}: http://localhost:${CONFIG.seed.self.openPaymentPublishedPort}/${account.path} hostname: ${CONFIG.seed.self.hostname}`
  })
  console.log(envVarStrings.join('\n'))
}

export async function runSeed(): Promise<void> {
  console.log('calling run_seed')
  return setupFromSeed(CONFIG)
}
