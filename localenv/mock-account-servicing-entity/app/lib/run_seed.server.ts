import {
  CONFIG,
  type Config,
  type Account,
  type Peering
} from './parse_config.server'
import {
  createAsset,
  createPeer,
  addPeerLiquidity,
  createWalletAddress,
  createWalletAddressKey,
  setFee,
  addAssetLiquidity
} from './requesters'
import { v4 } from 'uuid'
import { mockAccounts } from './accounts.server'
import { generateJwk } from '@interledger/http-signature-utils'
import { Asset, FeeType } from 'generated/graphql'

export async function setupFromSeed(config: Config): Promise<void> {
  const assets: Record<string, Asset> = {}
  for (const { code, scale, liquidity, liquidityThreshold } of config.seed
    .assets) {
    const { asset } = await createAsset(code, scale, liquidityThreshold)
    if (!asset) {
      throw new Error('asset not defined')
    }

    const addedLiquidity = await addAssetLiquidity(asset.id, liquidity, v4())

    assets[code] = asset
    console.log(JSON.stringify({ asset, addedLiquidity }, null, 2))

    const { fees } = config.seed
    const fee = fees.find((fee) => fee.asset === code && fee.scale == scale)
    if (fee) {
      await setFee(asset.id, FeeType.Sending, fee.fixed, fee.basisPoints)
    }
  }

  for (const asset of Object.values(assets)) {
    const peerResponses = await Promise.all(
      config.seed.peers.map(async (peer: Peering) => {
        const peerResponse = await createPeer(
          peer.peerIlpAddress,
          peer.peerUrl,
          asset.id,
          asset.code,
          peer.name,
          peer.liquidityThreshold
        ).then((response) => response.peer)
        if (!peerResponse) {
          throw new Error('peer response not defined')
        }
        const transferUid = v4()
        const liquidity = await addPeerLiquidity(
          peerResponse.id,
          peer.initialLiquidity,
          transferUid
        )
        return [peerResponse, liquidity]
      })
    )

    console.log(JSON.stringify(peerResponses, null, 2))
  }

  // Clear the accounts before seeding.
  await mockAccounts.clearAccounts()

  const accountResponses = await Promise.all(
    config.seed.accounts.map(async (account: Account) => {
      const accountAsset = assets[account.assetCode]
      await mockAccounts.create(
        account.id,
        account.path,
        account.name,
        accountAsset.code,
        accountAsset.scale,
        accountAsset.id
      )
      if (account.initialBalance) {
        await mockAccounts.credit(
          account.id,
          BigInt(account.initialBalance),
          false
        )
      }

      if (account.skipPaymentPointerCreation) {
        return
      }

      const walletAddress = await createWalletAddress(
        account.name,
        `https://${CONFIG.seed.self.hostname}/${account.path}`,
        accountAsset.id
      )

      await mockAccounts.setWalletAddress(
        account.id,
        walletAddress.id,
        walletAddress.url
      )

      await createWalletAddressKey({
        walletAddressId: walletAddress.id,
        jwk: generateJwk({
          keyId: `keyid-${account.id}`,
          privateKey: config.key
        }) as unknown as string
      })

      return walletAddress
    })
  )
  console.log('seed complete')
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
