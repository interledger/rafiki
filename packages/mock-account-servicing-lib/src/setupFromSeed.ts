import { v4 } from 'uuid'
import { ApolloClient, NormalizedCacheObject } from '@apollo/client'
import { generateJwk } from '@interledger/http-signature-utils'
import { createRequesters } from './requesters'
import { Config, Account, Peering } from './types'
import { Asset, FeeType } from './generated/graphql'
import { AccountProvider } from './AccountProvider'

interface SetupFromSeedOptions {
  debug?: boolean
}

export async function setupFromSeed(
  config: Config,
  apolloClient: ApolloClient<NormalizedCacheObject>,
  mockAccounts: AccountProvider,
  options: SetupFromSeedOptions = {}
): Promise<void> {
  const { debug = false } = options
  const {
    createAsset,
    depositAssetLiquidity,
    setFee,
    createPeer,
    depositPeerLiquidity,
    createAutoPeer,
    createWalletAddress,
    createWalletAddressKey
  } = createRequesters(apolloClient, debug)

  const assets: Record<string, Asset> = {}
  for (const { code, scale, liquidity, liquidityThreshold } of config.seed
    .assets) {
    const { asset } = await createAsset(code, scale, liquidityThreshold)
    if (!asset) {
      throw new Error('asset not defined')
    }

    const initialLiquidity = await depositAssetLiquidity(
      asset.id,
      liquidity,
      v4()
    )

    assets[code] = asset
    if (debug) {
      console.log(JSON.stringify({ asset, initialLiquidity }, null, 2))
    }

    const { fees } = config.seed
    const fee = fees.find((fee) => fee.asset === code && fee.scale == scale)
    if (fee) {
      await setFee(asset.id, FeeType.Sending, fee.fixed, fee.basisPoints)
    }
  }

  const peeringAsset = config.seed.peeringAsset

  const peerResponses = await Promise.all(
    config.seed.peers.map(async (peer: Peering) => {
      const peerResponse = await createPeer(
        peer.peerIlpAddress,
        peer.peerUrl,
        assets[peeringAsset].id,
        assets[peeringAsset].code,
        peer.name,
        peer.liquidityThreshold
      ).then((response) => response.peer)
      if (!peerResponse) {
        throw new Error('peer response not defined')
      }
      const transferUid = v4()
      const liquidity = await depositPeerLiquidity(
        peerResponse.id,
        peer.initialLiquidity,
        transferUid
      )
      return [peerResponse, liquidity]
    })
  )

  if (debug) {
    console.log(JSON.stringify(peerResponses, null, 2))
  }

  if (config.testnetAutoPeerUrl) {
    if (debug) {
      console.log('autopeering url: ', config.testnetAutoPeerUrl)
    }
    const autoPeerResponse = await createAutoPeer(
      config.testnetAutoPeerUrl,
      assets[peeringAsset].id
    ).catch((e) => {
      if (debug) {
        console.log('error on autopeering: ', e)
      }
      return
    })
    if (debug) {
      console.log(JSON.stringify(autoPeerResponse, null, 2))
    }
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

      if (account.skipWalletAddressCreation) {
        return
      }

      if (debug) {
        console.log('hostname: ', config.publicHost)
      }
      const walletAddress = await createWalletAddress(
        account.name,
        `${config.publicHost}/${account.path}`,
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
  if (debug) {
    console.log('seed complete')
    console.log(JSON.stringify(accountResponses, null, 2))
  }
  const hostname = new URL(config.publicHost).hostname
  const envVarStrings = config.seed.accounts.map((account) => {
    return `${account.postmanEnvVar}: ${config.publicHost}/${account.path} hostname: ${hostname}`
  })
  if (debug) {
    console.log(envVarStrings.join('\n'))
  }
}
